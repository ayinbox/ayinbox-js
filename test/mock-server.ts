import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

interface IndexRoute {
  method: string;
  path: string;
  status: number;
  body: string | null | Record<string, unknown>;
}

interface FixtureIndex {
  default_success_headers: Record<string, string>;
  routes: IndexRoute[];
  errors: Record<string, { status: number; headers: Record<string, string> }>;
}

export const fixtureIndex = JSON.parse(readFileSync(join(FIXTURES, 'index.json'), 'utf8')) as FixtureIndex;

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingMessage['headers'];
  rawHeaders: string[];
  body: string;
  json: unknown;
}

export interface CannedResponse {
  status: number;
  headers?: Record<string, string>;
  /** An object is sent as JSON, a string as is, `null` sends no body. */
  body: unknown;
}

/** A canned response built from an error fixture and its status and headers in index.json. */
export function errorResponse(name: string, headerOverrides: Record<string, string> = {}): CannedResponse {
  const meta = fixtureIndex.errors[`errors/${name}`];
  if (!meta) throw new Error(`no error fixture ${name}`);
  return { status: meta.status, headers: { ...meta.headers, ...headerOverrides }, body: fixture(`errors/${name}`) };
}

function resolveBody(spec: IndexRoute['body']): unknown {
  if (spec === null || spec === '') return spec;
  if (typeof spec === 'object') return spec;
  const indexed = /^(.+\.json)\[(\d+)\]$/.exec(spec);
  if (indexed) return (fixture(indexed[1]!) as unknown[])[Number(indexed[2])];
  const field = /^(.+\.json)#(\w+)\[(\d+)\]$/.exec(spec);
  if (field) return (fixture(field[1]!) as Record<string, unknown[]>)[field[2]!]![Number(field[3])];
  return fixture(spec);
}

function pathPattern(path: string): RegExp {
  const escaped = path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

function matchRoute(method: string, path: string, query: URLSearchParams, json: unknown): IndexRoute | undefined {
  const candidates = fixtureIndex.routes.filter((r) => r.method === method);
  if (method === 'GET' && path === '/v1/campaigns' && query.has('cursor')) {
    return candidates.find((r) => r.path.startsWith('/v1/campaigns?cursor='));
  }
  if (method === 'POST' && path === '/v1/contacts/search') {
    const ids = (json as { campaign_ids?: unknown[] } | undefined)?.campaign_ids;
    const one = Array.isArray(ids) && ids.length === 1;
    return candidates.find((r) => r.path === (one ? '/v1/contacts/search (campaign_ids=[one])' : '/v1/contacts/search'));
  }
  // Literal routes win over templated ones (for example /unibox/count over /unibox/{id}).
  const plain = candidates.filter((r) => !r.path.includes('?') && !r.path.includes(' '));
  return plain.find((r) => r.path === path) ?? plain.find((r) => pathPattern(r.path).test(path));
}

export class MockServer {
  readonly requests: RecordedRequest[] = [];
  readonly queue: CannedResponse[] = [];
  #server: Server;
  baseURL = '';

  constructor() {
    this.#server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const body = Buffer.concat(chunks).toString('utf8');
        let json: unknown;
        try {
          json = body === '' ? undefined : JSON.parse(body);
        } catch {
          json = undefined;
        }
        this.requests.push({
          method: req.method ?? '',
          path: url.pathname,
          query: url.searchParams,
          headers: req.headers,
          rawHeaders: req.rawHeaders,
          body,
          json,
        });

        let canned = this.queue.shift();
        if (!canned) {
          const route = matchRoute(req.method ?? '', url.pathname, url.searchParams, json);
          canned = route
            ? { status: route.status, body: resolveBody(route.body) }
            : { status: 404, body: fixture('errors/404_not_found.json') };
        }
        const headers: Record<string, string> =
          canned.status < 400 ? { ...fixtureIndex.default_success_headers } : {};
        Object.assign(headers, canned.headers ?? {});
        if (canned.body === null || canned.body === undefined) {
          delete headers['Content-Type'];
          res.writeHead(canned.status, headers);
          res.end();
          return;
        }
        const out = typeof canned.body === 'string' ? canned.body : JSON.stringify(canned.body);
        if (canned.body === '') delete headers['Content-Type'];
        res.writeHead(canned.status, headers);
        res.end(out);
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.#server.listen(0, '127.0.0.1', resolve));
    const { port } = this.#server.address() as AddressInfo;
    this.baseURL = `http://127.0.0.1:${port}/v1`;
  }

  async stop(): Promise<void> {
    this.#server.closeAllConnections?.();
    await new Promise<void>((resolve) => this.#server.close(() => resolve()));
  }

  reset(): void {
    this.requests.length = 0;
    this.queue.length = 0;
  }

  get last(): RecordedRequest {
    const r = this.requests[this.requests.length - 1];
    if (!r) throw new Error('no request recorded');
    return r;
  }
}
