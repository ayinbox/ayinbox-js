import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  APIError,
  AuthenticationError,
  AyInbox,
  AyInboxError,
  BadRequestError,
  ConflictError,
  ConnectionError,
  InternalServerError,
  NotFoundError,
  PaymentRequiredError,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
  ServiceUnavailableError,
  TimeoutError,
  UnprocessableEntityError,
  ValidationError,
  VERSION,
} from '../src/index.ts';
import { MockServer, errorResponse } from './mock-server.ts';

const KEY = 'aybox_test_key_not_real_000000000000000000000000';
const server = new MockServer();

beforeAll(() => server.start());
afterAll(() => server.stop());
afterEach(() => server.reset());

function client(extra: ConstructorParameters<typeof AyInbox>[0] = {}): AyInbox {
  return new AyInbox({ apiKey: KEY, baseURL: server.baseURL, ...extra });
}

describe('construction', () => {
  it('reads the key and base URL from the environment', async () => {
    const prevKey = process.env['AYINBOX_API_KEY'];
    const prevURL = process.env['AYINBOX_BASE_URL'];
    process.env['AYINBOX_API_KEY'] = KEY;
    process.env['AYINBOX_BASE_URL'] = `${server.baseURL}/`;
    try {
      const c = new AyInbox();
      expect(c.baseURL).toBe(server.baseURL);
      await c.me.get();
      expect(server.last.headers.authorization).toBe(`Bearer ${KEY}`);
    } finally {
      if (prevKey === undefined) delete process.env['AYINBOX_API_KEY'];
      else process.env['AYINBOX_API_KEY'] = prevKey;
      if (prevURL === undefined) delete process.env['AYINBOX_BASE_URL'];
      else process.env['AYINBOX_BASE_URL'] = prevURL;
    }
  });

  it('defaults to the hosted API', () => {
    const prevURL = process.env['AYINBOX_BASE_URL'];
    delete process.env['AYINBOX_BASE_URL'];
    try {
      expect(new AyInbox({ apiKey: KEY }).baseURL).toBe('https://api.ayinbox.com/v1');
    } finally {
      if (prevURL !== undefined) process.env['AYINBOX_BASE_URL'] = prevURL;
    }
  });

  it('refuses to start without a key', () => {
    const prev = process.env['AYINBOX_API_KEY'];
    delete process.env['AYINBOX_API_KEY'];
    try {
      expect(() => new AyInbox()).toThrow(AyInboxError);
    } finally {
      if (prev !== undefined) process.env['AYINBOX_API_KEY'] = prev;
    }
  });

  it('never exposes the key in serialized or inspected output', async () => {
    const c = client();
    expect(JSON.stringify(c)).not.toContain(KEY);
    const { inspect } = await import('node:util');
    expect(inspect(c, { depth: 5 })).not.toContain(KEY);
  });
});

describe('headers', () => {
  it('sends auth, user agent and accept, and no content type without a body', async () => {
    const me = await client().me.get();
    expect(me.email).toBeTypeOf('string');
    const req = server.last;
    expect(req.method).toBe('GET');
    expect(req.path).toBe('/v1/me');
    expect(req.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(req.headers['user-agent']).toBe(`ayinbox-typescript/${VERSION}`);
    expect(req.headers.accept).toBe('application/json');
    expect(req.headers['content-type']).toBeUndefined();
    expect(req.headers['idempotency-key']).toBeUndefined();
  });

  it('sends JSON with a content type and the idempotency key once', async () => {
    await client().templates.create({ name: 'Intro' }, { idempotencyKey: 'key-123' });
    const req = server.last;
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.headers['idempotency-key']).toBe('key-123');
    const lines = req.rawHeaders.filter((_, i) => i % 2 === 0).map((h) => h.toLowerCase());
    expect(lines.filter((h) => h === 'idempotency-key')).toHaveLength(1);
    expect(lines.filter((h) => h === 'authorization')).toHaveLength(1);
    expect(req.json).toEqual({ name: 'Intro' });
  });

  it('adds per-call and default headers but never lets them replace auth', async () => {
    const c = client({ defaultHeaders: { 'X-Team': 'growth' } });
    await c.me.get({ headers: { 'X-Request-Id': 'trace-1', Authorization: 'Bearer other' } });
    expect(server.last.headers['x-team']).toBe('growth');
    expect(server.last.headers['x-request-id']).toBe('trace-1');
    expect(server.last.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it('uses an injected fetch', async () => {
    const seen: string[] = [];
    const c = client({
      fetch: (url, init) => {
        seen.push(`${init.method} ${url}`);
        return fetch(url, init);
      },
    });
    await c.me.get();
    expect(seen).toEqual([`GET ${server.baseURL}/me`]);
  });
});

describe('typed errors', () => {
  const cases: [string, abstract new (...a: never[]) => APIError, string][] = [
    ['400_bad_request.json', BadRequestError, 'bad_request'],
    ['400_invalid_cursor.json', BadRequestError, 'bad_request'],
    ['401_unauthorized.json', AuthenticationError, 'unauthorized'],
    ['401_api_key_holder_left.json', AuthenticationError, 'api_key_holder_left'],
    ['402_insufficient_credits.json', PaymentRequiredError, 'insufficient_credits'],
    ['403_forbidden.json', PermissionDeniedError, 'forbidden'],
    ['403_api_key_mailbox_limited.json', PermissionDeniedError, 'api_key_mailbox_limited'],
    ['404_not_found.json', NotFoundError, 'not_found'],
    ['409_conflict.json', ConflictError, 'conflict'],
    ['409_idempotency_outcome_unknown.json', ConflictError, 'idempotency_outcome_unknown'],
    ['409_idempotent_secret_withheld.json', ConflictError, 'idempotent_secret_withheld'],
    ['422_unprocessable.json', UnprocessableEntityError, 'unprocessable'],
    ['500_internal_error.json', InternalServerError, 'internal_error'],
  ];

  for (const [name, cls, code] of cases) {
    it(`maps ${name}`, async () => {
      server.queue.push(errorResponse(name));
      const err = await client({ maxRetries: 0 })
        .campaigns.get('11111111-1111-4111-8111-111111111111')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(cls);
      expect(err).toBeInstanceOf(APIError);
      expect(err).toBeInstanceOf(AyInboxError);
      const e = err as APIError;
      expect(e.code).toBe(code);
      expect(e.requestId).toBe('req-fixture-0001');
      expect(e.status).toBe(Number(name.slice(0, 3)));
      expect(e.message).toBe((e.body as { message: string }).message);
      expect(e.message).not.toContain(KEY);
    });
  }

  it('groups 400 and 422 under ValidationError and 5xx under ServerError', () => {
    expect(BadRequestError.prototype).toBeInstanceOf(ValidationError);
    expect(UnprocessableEntityError.prototype).toBeInstanceOf(ValidationError);
    expect(ServiceUnavailableError.prototype).toBeInstanceOf(ServerError);
    expect(InternalServerError.prototype).toBeInstanceOf(ServerError);
  });

  it('maps a 503 with Retry-After', async () => {
    server.queue.push(errorResponse('503_service_unavailable.json'));
    const err = (await client({ maxRetries: 0 }).me.get().catch((e: unknown) => e)) as ServiceUnavailableError;
    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect(err.code).toBe('service_unavailable');
    expect(err.retryAfter).toBe(5);
  });

  it('maps the per-key 429 with retry_after', async () => {
    server.queue.push(errorResponse('429_api_key_rate_limited.json'));
    const err = (await client({ maxRetries: 0 }).me.get().catch((e: unknown) => e)) as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.code).toBe('rate_limit_exceeded');
    expect(err.retryAfter).toBe(12);
    expect(err.requestId).toBe('req-fixture-0001');
  });

  it('maps the category 429 that has no code and no request id', async () => {
    server.queue.push(errorResponse('429_category_rate_limited.json'));
    const err = (await client({ maxRetries: 0 }).templates.list().catch((e: unknown) => e)) as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.code).toBe('rate_limit_exceeded');
    expect(err.requestId).toBeUndefined();
    expect(err.retryAfter).toBe(12);
    expect(err.message).toBe('Rate limit exceeded for write operations');
  });

  it('falls back to retry_after_ms when there is no Retry-After header', async () => {
    const r = errorResponse('429_category_rate_limited.json');
    delete r.headers!['Retry-After'];
    server.queue.push(r);
    const err = (await client({ maxRetries: 0 }).me.get().catch((e: unknown) => e)) as RateLimitError;
    expect(err.retryAfter).toBe(12);
  });

  it('keeps a non-JSON body as text and derives the code from the status', async () => {
    server.queue.push({ status: 502, headers: { 'Content-Type': 'text/html', 'X-Request-Id': 'edge-1' }, body: '<h1>Bad gateway</h1>' });
    const err = (await client({ maxRetries: 0 }).me.get().catch((e: unknown) => e)) as InternalServerError;
    expect(err).toBeInstanceOf(InternalServerError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('internal_error');
    expect(err.body).toBe('<h1>Bad gateway</h1>');
    expect(err.requestId).toBe('edge-1');
  });
});

describe('retries', () => {
  it('retries a 503 then succeeds', async () => {
    server.queue.push({ ...errorResponse('503_service_unavailable.json'), headers: { 'Retry-After': '0' } });
    const me = await client().me.get();
    expect(me.user_id).toBeTypeOf('string');
    expect(server.requests).toHaveLength(2);
  });

  it('waits for Retry-After on a 429 then succeeds', async () => {
    server.queue.push(errorResponse('429_api_key_rate_limited.json', { 'Retry-After': '1' }));
    const started = Date.now();
    const page = await client().campaigns.list();
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(page.data.length).toBeGreaterThan(0);
    expect(server.requests).toHaveLength(2);
  });

  it('retries a keyless POST on 429, which never ran', async () => {
    server.queue.push(errorResponse('429_category_rate_limited.json', { 'Retry-After': '0' }));
    await client().templates.create({ name: 'x' });
    expect(server.requests).toHaveLength(2);
  });

  it('does not retry a keyless POST on 503', async () => {
    server.queue.push(errorResponse('503_service_unavailable.json', { 'Retry-After': '0' }));
    await expect(client().templates.create({ name: 'x' })).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(server.requests).toHaveLength(1);
  });

  it('does not retry a keyless PATCH on 502', async () => {
    server.queue.push({ status: 502, body: { error: 'Bad Gateway', message: 'upstream' } });
    await expect(client().templates.update('t1', { name: 'x' })).rejects.toBeInstanceOf(InternalServerError);
    expect(server.requests).toHaveLength(1);
  });

  it('retries a POST that carries an idempotency key with the same key', async () => {
    server.queue.push(errorResponse('503_service_unavailable.json', { 'Retry-After': '0' }));
    await client().templates.create({ name: 'x' }, { idempotencyKey: 'same-key' });
    expect(server.requests).toHaveLength(2);
    expect(server.requests.map((r) => r.headers['idempotency-key'])).toEqual(['same-key', 'same-key']);
  });

  it('retries contact search, a read-only POST, without a key', async () => {
    server.queue.push(errorResponse('503_service_unavailable.json', { 'Retry-After': '0' }));
    const page = await client().contacts.list();
    expect(page.data.length).toBeGreaterThan(0);
    expect(server.requests).toHaveLength(2);
  });

  it('does not retry a 500', async () => {
    server.queue.push(errorResponse('500_internal_error.json'));
    await expect(client().me.get()).rejects.toBeInstanceOf(InternalServerError);
    expect(server.requests).toHaveLength(1);
  });

  it('does not retry 409 idempotency_outcome_unknown', async () => {
    server.queue.push(errorResponse('409_idempotency_outcome_unknown.json'));
    await expect(client().unibox.reply({ email_account_id: 'm', to: ['a@example.com'], subject: 's' }, { idempotencyKey: 'k' }))
      .rejects.toMatchObject({ code: 'idempotency_outcome_unknown' });
    expect(server.requests).toHaveLength(1);
  });

  it('gives up after maxRetries and throws the last error', async () => {
    for (let i = 0; i < 3; i++) server.queue.push(errorResponse('503_service_unavailable.json', { 'Retry-After': '0' }));
    await expect(client({ maxRetries: 2 }).me.get()).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(server.requests).toHaveLength(3);
  });

  it('honours maxRetries 0 per call', async () => {
    server.queue.push(errorResponse('503_service_unavailable.json', { 'Retry-After': '0' }));
    await expect(client().me.get({ maxRetries: 0 })).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(server.requests).toHaveLength(1);
  });
});

describe('network failures', () => {
  it('throws ConnectionError when nothing listens', async () => {
    const c = new AyInbox({ apiKey: KEY, baseURL: 'http://127.0.0.1:1/v1', maxRetries: 0 });
    const err = await c.me.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err).not.toBeInstanceOf(TimeoutError);
    expect((err as Error).message).not.toContain(KEY);
  });

  it('retries a connection error on a GET', async () => {
    let calls = 0;
    const c = client({
      fetch: (url, init) => {
        calls++;
        if (calls === 1) return Promise.reject(new TypeError('fetch failed'));
        return fetch(url, init);
      },
    });
    await c.me.get();
    expect(calls).toBe(2);
  });

  it('does not retry a connection error on a keyless POST', async () => {
    let calls = 0;
    const c = client({
      fetch: () => {
        calls++;
        return Promise.reject(new TypeError('fetch failed'));
      },
    });
    await expect(c.campaigns.start('c1')).rejects.toBeInstanceOf(ConnectionError);
    expect(calls).toBe(1);
  });

  it('throws TimeoutError after the timeout', async () => {
    const c = client({
      timeout: 50,
      maxRetries: 0,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    await expect(c.me.get()).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('generic request and bodies', () => {
  it('reaches any route through request()', async () => {
    const res = await client().request<{ count: number }>('GET', '/unibox/count', { query: { email_id: 'abc' } });
    expect(res.count).toBeTypeOf('number');
    expect(server.last.query.get('email_id')).toBe('abc');
  });

  it('returns undefined for a 204', async () => {
    await expect(client().request('DELETE', '/campaigns/11111111-1111-4111-8111-111111111111')).resolves.toBeUndefined();
  });

  it('returns undefined for a 200 with an empty body', async () => {
    await expect(client().campaigns.steps.delete('c1', 's1')).resolves.toBeUndefined();
    expect(server.last.path).toBe('/v1/campaigns/c1/steps/s1');
  });

  it('sends an explicit null distinct from an omitted field', async () => {
    await client().campaigns.update('c1', { end_date: null, name: 'Renamed' });
    expect(server.last.body).toBe('{"end_date":null,"name":"Renamed"}');
  });

  it('serializes dates and arrays in the query', async () => {
    await client().unibox.listThreads({
      since: new Date('2026-11-01T00:00:00Z'),
      email_ids: ['a', 'b'],
      unseen: true,
      limit: 20,
    });
    const q = server.last.query;
    expect(q.get('since')).toBe('2026-11-01T00:00:00.000Z');
    expect(q.get('email_ids')).toBe('a,b');
    expect(q.get('unseen')).toBe('true');
    expect(q.get('limit')).toBe('20');
    expect(q.has('cursor')).toBe(false);
  });

  it('encodes path segments', async () => {
    await client().aiTools.call('a/b', {}).catch(() => undefined);
    expect(server.last.path).toBe('/v1/ai/tools/a%2Fb/call');
  });
});

describe('pagination', () => {
  it('walks two pages with for await', async () => {
    const names: string[] = [];
    for await (const c of client().campaigns.list({ limit: 2 })) names.push(c.name);
    expect(names).toHaveLength(3);
    expect(server.requests).toHaveLength(2);
    expect(server.requests[0]!.query.has('cursor')).toBe(false);
    expect(server.requests[1]!.query.get('cursor')).toBe('c1_ZmFrZS1jdXJzb3ItcGFnZS0y');
    expect(server.requests[1]!.query.get('limit')).toBe('2');
  });

  it('returns one page with its cursor when awaited', async () => {
    const page = await client().campaigns.list();
    expect(page.data).toHaveLength(2);
    expect(page.nextCursor).toBe('c1_ZmFrZS1jdXJzb3ItcGFnZS0y');
    expect(page.hasNextPage()).toBe(true);
    const next = await page.getNextPage();
    expect(next?.hasNextPage()).toBe(false);
    expect(await next?.getNextPage()).toBeNull();
    expect(server.requests).toHaveLength(2);
  });

  it('resends the same search body on every page', async () => {
    server.queue.push({
      status: 200,
      body: { data: [{ id: 'a' }], pagination: { next_cursor: 'o1_next', has_more: true, total: 2 } },
    });
    server.queue.push({ status: 200, body: { data: [{ id: 'b' }], pagination: { next_cursor: null, has_more: false } } });
    const ids: string[] = [];
    for await (const c of client().contacts.list({ query: 'acme', sort_by: 'email', limit: 1 })) ids.push(c.id);
    expect(ids).toEqual(['a', 'b']);
    expect(server.requests[0]!.json).toEqual({ query: 'acme', sort_by: 'email' });
    expect(server.requests[1]!.json).toEqual({ query: 'acme', sort_by: 'email' });
    expect(server.requests[1]!.query.get('cursor')).toBe('o1_next');
  });

  it('paginates any route with paginate()', async () => {
    const rows: unknown[] = [];
    for await (const row of client().paginate('/campaigns')) rows.push(row);
    expect(rows).toHaveLength(3);
  });

  it('waits out a 429 mid-walk instead of returning a partial list', async () => {
    const c = client();
    const it = c.campaigns.list()[Symbol.asyncIterator]();
    await it.next();
    await it.next();
    server.queue.push(errorResponse('429_api_key_rate_limited.json', { 'Retry-After': '0' }));
    const third = await it.next();
    expect(third.done).toBe(false);
    expect(server.requests).toHaveLength(3);
  });
});
