import {
  AyInboxError,
  ConnectionError,
  TimeoutError,
  errorFromResponse,
  type APIError,
} from './errors.ts';
import type { ListResponse } from './types.ts';
import { VERSION } from './version.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A `fetch`-compatible function. */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export type QueryValue = string | number | boolean | Date | null | undefined | readonly (string | number)[];
export type Query = Record<string, QueryValue>;

export interface ClientOptions {
  /** API key (`aybox_...`) or OAuth access token (`ayat_...`). Defaults to `AYINBOX_API_KEY`. */
  apiKey?: string | undefined;
  /** Defaults to `AYINBOX_BASE_URL`, then `https://api.ayinbox.com/v1`. */
  baseURL?: string | undefined;
  /** Per-attempt timeout in milliseconds. Default 30000. */
  timeout?: number | undefined;
  /** Automatic retries after the first attempt. Default 2; 0 disables. */
  maxRetries?: number | undefined;
  /** Custom `fetch`, for example one with a proxy agent or a test double. Defaults to the global `fetch`. */
  fetch?: Fetch | undefined;
  /** Headers sent on every request. */
  defaultHeaders?: Record<string, string> | undefined;
}

export interface RequestOptions {
  /** Sent as `Idempotency-Key`. Pass one on every mutating call you might retry. */
  idempotencyKey?: string | undefined;
  /** Per-attempt timeout in milliseconds for this call. */
  timeout?: number | undefined;
  /** Retries for this call. */
  maxRetries?: number | undefined;
  /** Extra headers for this call. */
  headers?: Record<string, string> | undefined;
  /** Cancels the call. */
  signal?: AbortSignal | undefined;
}

export interface GenericRequestOptions extends RequestOptions {
  query?: Query | undefined;
  body?: unknown;
}

interface InternalRequest {
  query?: Query | undefined;
  body?: unknown;
  options?: RequestOptions | undefined;
  /** A POST that only reads (contact search), so it may be retried without a key. */
  safe?: boolean;
}

export const DEFAULT_BASE_URL = 'https://api.ayinbox.com/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_AFTER_CAP_S = 120;
const BACKOFF_BASE_S = 0.5;
const BACKOFF_CAP_S = 8;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function readEnv(name: string): string | undefined {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    const v = proc?.env?.[name];
    return v === undefined || v === '' ? undefined : v;
  } catch {
    return undefined;
  }
}

function encodeQuery(query: Query | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.append(key, value.join(','));
    } else if (value instanceof Date) {
      params.append(key, value.toISOString());
    } else {
      params.append(key, String(value));
    }
  }
  const s = params.toString();
  return s === '' ? '' : `?${s}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ConnectionError('Request was aborted.', { cause: signal.reason }));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new ConnectionError('Request was aborted.', { cause: signal?.reason }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function backoffMs(attempt: number): number {
  const ceiling = Math.min(BACKOFF_CAP_S, BACKOFF_BASE_S * 2 ** attempt);
  return Math.random() * ceiling * 1000;
}

function isJsonContentType(ct: string): boolean {
  return /\bjson\b/i.test(ct);
}

async function decodeBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const ct = response.headers.get('content-type') ?? '';
  const buf = new Uint8Array(await response.arrayBuffer());
  if (buf.byteLength === 0) return undefined;
  if (ct !== '' && !isJsonContentType(ct) && !/^text\//i.test(ct)) return buf;
  const text = new TextDecoder().decode(buf);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Shared HTTP machinery: auth, retries, error mapping. Resource classes call it. */
export class Core {
  readonly baseURL: string;
  readonly timeout: number;
  readonly maxRetries: number;
  #apiKey: string;
  #fetch: Fetch;
  #defaultHeaders: Record<string, string>;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv('AYINBOX_API_KEY');
    if (!apiKey) {
      throw new AyInboxError('No API key. Pass `apiKey` or set the AYINBOX_API_KEY environment variable.');
    }
    this.#apiKey = apiKey;
    this.baseURL = (options.baseURL ?? readEnv('AYINBOX_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const f = options.fetch ?? (globalThis.fetch as Fetch | undefined);
    if (typeof f !== 'function') {
      throw new AyInboxError('No global fetch found. Pass `fetch` in the client options.');
    }
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#defaultHeaders = { ...options.defaultHeaders };
  }

  /** Keeps the key out of `JSON.stringify` and debug output. */
  toJSON(): Record<string, unknown> {
    return { baseURL: this.baseURL, timeout: this.timeout, maxRetries: this.maxRetries, apiKey: '[redacted]' };
  }

  /**
   * Calls any route under the base URL with the client's auth, retries and error mapping.
   * Returns the decoded JSON, a string for text, a `Uint8Array` for other bodies, or `undefined` when empty.
   */
  request<T = unknown>(method: HttpMethod, path: string, options: GenericRequestOptions = {}): Promise<T> {
    const { query, body, ...rest } = options;
    return this._request<T>(method, path, { query, body, options: rest });
  }

  /**
   * Walks every item of any paginated route. Await it for the first page, or `for await` it for every item.
   * For `POST /contacts/search` pass `method: 'POST'` and the search body; it is resent on every page.
   */
  paginate<T = unknown>(
    path: string,
    params: { query?: Query; body?: unknown; method?: 'GET' | 'POST' } = {},
    options?: RequestOptions,
  ): PagePromise<T> {
    const method = params.method ?? 'GET';
    return this._list<T>(method, path, params.query, params.body, options, method === 'POST');
  }

  /** @internal */
  _list<T, R extends ListResponse<T> = ListResponse<T>>(
    method: 'GET' | 'POST',
    path: string,
    query: Query | undefined,
    body: unknown,
    options: RequestOptions | undefined,
    safe = false,
  ): PagePromise<T, R> {
    const fetchPage = (cursor: string | undefined): Promise<R> =>
      this._request<R>(method, path, {
        query: cursor === undefined ? query : { ...query, cursor },
        body,
        options,
        safe,
      });
    return new PagePromise<T, R>(fetchPage, query?.['cursor'] as string | undefined);
  }

  /** @internal */
  async _request<T>(method: HttpMethod, path: string, req: InternalRequest = {}): Promise<T> {
    const opts = req.options ?? {};
    const url = this.baseURL + (path.startsWith('/') ? path : `/${path}`) + encodeQuery(req.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `ayinbox-typescript/${VERSION}`,
      ...this.#defaultHeaders,
      ...opts.headers,
      Authorization: `Bearer ${this.#apiKey}`,
    };
    let payload: string | undefined;
    if (req.body !== undefined) {
      payload = JSON.stringify(req.body);
      headers['Content-Type'] = 'application/json';
    }
    if (opts.idempotencyKey !== undefined) headers['Idempotency-Key'] = opts.idempotencyKey;

    const maxRetries = Math.max(0, opts.maxRetries ?? this.maxRetries);
    const timeout = opts.timeout ?? this.timeout;
    const replaySafe =
      req.safe === true || opts.idempotencyKey !== undefined || (method !== 'POST' && method !== 'PATCH');

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < maxRetries;
      let response: Response;
      try {
        response = await this.#send(url, method, headers, payload, timeout, opts.signal);
      } catch (err) {
        if (canRetry && replaySafe && !(opts.signal?.aborted ?? false)) {
          await sleep(backoffMs(attempt), opts.signal);
          continue;
        }
        throw err;
      }

      if (response.ok) return (await decodeBody(response)) as T;

      const error: APIError = errorFromResponse(
        response.status,
        response.headers,
        await decodeBody(response).catch(() => undefined),
      );
      const retryable = RETRYABLE_STATUS.has(response.status) && (response.status === 429 || replaySafe);
      if (canRetry && retryable) {
        const wait =
          error.retryAfter !== undefined ? Math.min(error.retryAfter, RETRY_AFTER_CAP_S) * 1000 : backoffMs(attempt);
        await sleep(wait, opts.signal);
        continue;
      }
      throw error;
    }
  }

  async #send(
    url: string,
    method: HttpMethod,
    headers: Record<string, string>,
    body: string | undefined,
    timeout: number,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const onAbort = (): void => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined) init.body = body;
      return await this.#fetch(url, init);
    } catch (err) {
      if (timedOut) throw new TimeoutError(`Request timed out after ${timeout} ms.`, { cause: err });
      if (signal?.aborted) throw new ConnectionError('Request was aborted.', { cause: err });
      const detail = err instanceof Error ? err.message : String(err);
      throw new ConnectionError(`Connection error: ${detail}`, { cause: err });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

/** One page of a list, plus the cursor to the next. Iterating it walks this page and every page after it. */
export class Page<T, R extends ListResponse<T> = ListResponse<T>> implements AsyncIterable<T> {
  /** Items on this page. */
  readonly data: T[];
  /** The page's `pagination` object. */
  readonly pagination: R['pagination'];
  /** The whole response body, including extra fields such as `counts`. */
  readonly response: R;
  readonly #fetchPage: (cursor: string | undefined) => Promise<R>;

  constructor(fetchPage: (cursor: string | undefined) => Promise<R>, response: R) {
    this.#fetchPage = fetchPage;
    this.response = response;
    this.data = Array.isArray(response?.data) ? response.data : [];
    this.pagination = response?.pagination ?? { next_cursor: null, has_more: false };
  }

  /** The opaque cursor for the next page, or `null`. */
  get nextCursor(): string | null {
    const c = this.pagination?.next_cursor;
    return typeof c === 'string' && c !== '' ? c : null;
  }

  hasNextPage(): boolean {
    return this.pagination?.has_more === true && this.nextCursor !== null;
  }

  /** Fetches the next page, or returns `null` when there is none. */
  async getNextPage(): Promise<Page<T, R> | null> {
    const cursor = this.nextCursor;
    if (!this.hasNextPage() || cursor === null) return null;
    return new Page<T, R>(this.#fetchPage, await this.#fetchPage(cursor));
  }

  /** Yields this page and every page after it. */
  async *iterPages(): AsyncGenerator<Page<T, R>, void, undefined> {
    let page: Page<T, R> | null = this;
    while (page) {
      yield page;
      page = await page.getNextPage();
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    for await (const page of this.iterPages()) {
      for (const item of page.data) yield item;
    }
  }
}

/** Await it for the first `Page`, or iterate it with `for await` for every item on every page. */
export class PagePromise<T, R extends ListResponse<T> = ListResponse<T>>
  implements PromiseLike<Page<T, R>>, AsyncIterable<T>
{
  readonly #fetchPage: (cursor: string | undefined) => Promise<R>;
  readonly #startCursor: string | undefined;
  #first: Promise<Page<T, R>> | undefined;

  constructor(fetchPage: (cursor: string | undefined) => Promise<R>, startCursor?: string) {
    this.#fetchPage = fetchPage;
    this.#startCursor = startCursor;
  }

  #load(): Promise<Page<T, R>> {
    this.#first ??= this.#fetchPage(this.#startCursor).then((r) => new Page<T, R>(this.#fetchPage, r));
    return this.#first;
  }

  then<A = Page<T, R>, B = never>(
    onfulfilled?: ((value: Page<T, R>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.#load().then(onfulfilled, onrejected);
  }

  catch<B = never>(onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<Page<T, R> | B> {
    return this.#load().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<Page<T, R>> {
    return this.#load().finally(onfinally);
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    const first = await this.#load();
    yield* first;
  }
}
