# AY Inbox TypeScript SDK

The official TypeScript and JavaScript client for the [AY Inbox REST API](https://docs.ayinbox.com/api/). AY Inbox is a hosted cold email platform: it sends cold email at a paced daily volume, brings every reply into one inbox (Unibox), drafts answers from a per-campaign brain, and can offer a meeting time from Cal.com or Calendly.

AY Inbox is a hosted service. This repository holds the TypeScript SDK for its public API. The service itself is not open source.

Access to the hosted service is invite only for now: ask at team@ayinbox.com.

- Zero runtime dependencies. Uses the platform `fetch` and Web Crypto.
- Runs on Node 18+, Bun, Deno, Cloudflare Workers and other edge runtimes.
- ESM and CommonJS builds with type declarations.

## Install

Not on npm yet. Until the first release, install from GitHub (this builds the package on install):

```bash
npm install github:ayinbox/ayinbox-js
```

Once it is published, the package name is `ayinbox`.

## Quick start

```ts
import { AyInbox, NotFoundError } from 'ayinbox';

const client = new AyInbox(); // reads AYINBOX_API_KEY

const me = await client.me.get();
console.log(me.email, me.scopes);

for await (const campaign of client.campaigns.list()) {
  console.log(campaign.status, campaign.name);
}

const [contact] = await client.contacts.create(
  { email: 'lee@example.com', first_name: 'Lee', company: 'Example Co' },
  { idempotencyKey: 'import-lee-2026-11-13' },
);

try {
  await client.contacts.get('00000000-0000-4000-8000-000000000000');
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId);
  else throw err;
}
```

CommonJS works too: `const { AyInbox } = require('ayinbox');`.

## Configuration

```ts
const client = new AyInbox({
  apiKey: 'aybox_...', // default: AYINBOX_API_KEY
  baseURL: 'https://api.ayinbox.com/v1', // default: AYINBOX_BASE_URL, then this
  timeout: 30_000, // per attempt, in milliseconds
  maxRetries: 2, // 0 disables retries
  fetch: customFetch, // optional, any fetch-compatible function
  defaultHeaders: { 'X-Request-Id': 'my-trace-id' },
});
```

The credential is an API key (`aybox_...`) or an OAuth access token (`ayat_...`), sent as `Authorization: Bearer <credential>`. The SDK never logs it and keeps it out of error messages and `JSON.stringify(client)`.

Every method takes a final `options` argument for one call: `idempotencyKey`, `timeout`, `maxRetries`, `headers` and `signal` (an `AbortSignal`).

## Resources

| Resource | Methods |
|---|---|
| `client.me` | `get` |
| `client.campaigns` | `list`, `get`, `create`, `update`, `delete`, `start`, `pause`, `duplicate`, `overview` |
| `client.campaigns.steps` | `list`, `create`, `update`, `delete` |
| `client.campaigns.leads` | `list`, `add`, `getHold`, `pause`, `resume` |
| `client.contacts` | `list`, `get`, `create`, `update`, `delete`, `bulkDelete` |
| `client.mailboxes` | `list`, `get`, `getSync` |
| `client.unibox` | `listThreads`, `getThread`, `getMessage`, `unreadCount`, `reply`, `listDrafts`, `saveDraft`, `deleteDraft`, `listAgentDrafts`, `approveAgentDraft`, `discardAgentDraft` |
| `client.templates` | `list`, `get`, `create`, `update`, `delete` |
| `client.webhooks` | `list`, `create`, `update`, `delete`, `rotateSecret`, `verify`, `eventTypes`, `listDeliveries`, `verifySignature`, `constructEvent` |
| `client.analytics` | `dashboard`, `campaign`, `campaignDaily`, `accounts`, `account` |
| `client.suppressions` | `list`, `add`, `remove` |
| `client.aiTools` | `list`, `call` |

Request and response fields use the API's own snake_case names, so the [API reference](https://docs.ayinbox.com/api/) applies as written. A few notes:

- `campaigns.pause` calls `POST /campaigns/{id}/stop`.
- `mailboxes` is the `/emails` route family.
- `contacts.list` and `campaigns.leads.list` call `POST /contacts/search`. `cursor`, `limit` and `category` go in the query string, every other field is a filter in the body.
- `contacts.create` takes one contact or an array and always resolves to an array. It upserts by email.
- `campaigns.update` sends an explicit `null` for `start_date` or `end_date` when you pass `null`, which clears it. An omitted field is left unchanged.
- `webhooks.update` replaces the whole endpoint: send the full desired state. An omitted `enabled` becomes `true`.
- `templates.list`, `webhooks.list`, `campaigns.steps.list`, `unibox.listDrafts`, `unibox.listAgentDrafts` and `aiTools.list` are not paginated and return the whole response.

### Any other route

`client.request` reaches every route with the same auth, retries and error mapping:

```ts
// Deliveries for one webhook endpoint.
const deliveries = await client.request('GET', `/webhooks/${endpointId}/deliveries`, {
  query: { status: 'failed', limit: 50 },
});

// The same walk as a list method, on any paginated route.
for await (const row of client.paginate(`/webhooks/${endpointId}/deliveries`)) console.log(row);
```

`request(method, path, { query, body, idempotencyKey, headers, timeout, maxRetries, signal })` takes a path relative to the base URL.

It returns the decoded JSON, a string for a text body, a `Uint8Array` for other bodies, or `undefined` when the body is empty.

## Errors

Every error extends `AyInboxError`. An error the API answered is an `APIError` with `status`, `code`, `message`, `reason`, `requestId`, `body`, `headers` and, when known, `retryAfter` (seconds). Branch on `code` and `status`, never on `message`.

| Class | Status |
|---|---|
| `BadRequestError` (a `ValidationError`) | 400 |
| `AuthenticationError` | 401 (`unauthorized`, `api_key_holder_left`) |
| `PaymentRequiredError` | 402 (`insufficient_credits`) |
| `PermissionDeniedError` | 403 (`forbidden`, `api_key_mailbox_limited`, and others) |
| `NotFoundError` | 404 |
| `ConflictError` | 409 (`conflict`, `idempotency_outcome_unknown`, `idempotent_secret_withheld`, `draft_flagged`, and others) |
| `UnprocessableEntityError` (a `ValidationError`) | 422 |
| `RateLimitError` | 429 |
| `InternalServerError` (a `ServerError`) | 500, 501, 502, 504 and other 5xx |
| `ServiceUnavailableError` (a `ServerError`) | 503 |
| `ConnectionError` | no HTTP answer (DNS, TLS, reset, aborted) |
| `TimeoutError` (a `ConnectionError`) | the per-attempt timeout passed |

The SDK reads `code` from the body when present. Some rate limit answers carry no `code` and no `request_id`; the SDK then derives the code from the status (`rate_limit_exceeded`) and reads the wait from `Retry-After`, `retry_after` or `retry_after_ms`.

## Retries and timeouts

The SDK retries 429, 502, 503 and 504 answers and connection failures, up to `maxRetries` times (default 2, so 3 attempts). It waits for `Retry-After` when the server sends one (capped at 120 seconds), and otherwise backs off exponentially with full jitter (0.5 seconds doubling, capped at 8 seconds).

- It never retries a `POST` or `PATCH` without an idempotency key, except on 429, which the server never ran. `contacts.list` and `campaigns.leads.list` are reads and are retried.
- It never retries a 500 or a 409, including `409 idempotency_outcome_unknown`.
- `timeout` (default 30 seconds) applies to each attempt.

## Pagination

List methods return a page you can await, or iterate across every page:

```ts
const page = await client.campaigns.list({ limit: 50 });
page.data; // this page
page.nextCursor; // opaque cursor, or null
page.response; // the whole body, for example `counts` on contacts.list
const next = await page.getNextPage(); // null at the end

for await (const contact of client.contacts.list({ subscribed: true })) {
  // every contact on every page; the search body is resent on each page
}
```

`client.paginate(path, { query, body, method })` walks any other paginated route the same way. A 429 during a walk is waited out with the normal retry rules.

## Idempotency

Every mutating method accepts `{ idempotencyKey }`, sent as the `Idempotency-Key` header (1 to 255 visible ASCII characters). The server keeps the result for 24 hours: the same key and the same request replays the first answer. The SDK does not generate keys for you, so a call without one is never retried after it may have reached the server.

- The same key with a different request answers `409 conflict`.
- If the first attempt ended in a 5xx or never finished, the key answers `409 idempotency_outcome_unknown` for 24 hours. Find out whether the change happened before you try again with a new key.
- `webhooks.create` and `webhooks.rotateSecret` return a secret that is shown once, so a replay answers `409 idempotent_secret_withheld`. List the endpoints, and rotate the secret if you lost it.

## Webhooks

Deliveries carry `X-Ayinbox-Signature: t=<unix seconds>,v1=<hex>`, an HMAC-SHA256 of `<t>.<raw body>` keyed with the endpoint secret, `whsec_` prefix included. Verify the raw body, before any JSON parsing:

```ts
import { constructEvent, verifySignature, SignatureVerificationError } from 'ayinbox';

// In a fetch-style handler (Workers, Bun, Deno, Next.js route handlers):
const body = await request.text();
const header = request.headers.get('x-ayinbox-signature');

try {
  const event = await constructEvent(body, header, process.env.AYINBOX_WEBHOOK_SECRET!);
  // event.id equals X-Ayinbox-Event-Id and is stable across retries: use it to dedupe.
  console.log(event.event_type, event.data);
} catch (err) {
  if (err instanceof SignatureVerificationError) return new Response('bad signature', { status: 400 });
  throw err;
}

// Or just a boolean:
const ok = await verifySignature(body, header, secret); // default tolerance 300 seconds
```

The comparison is constant time. Timestamps more than 300 seconds from now fail; pass `{ toleranceSeconds }` to change that. Both helpers are also on `client.webhooks`. In Express, read the body with `express.raw({ type: 'application/json' })` so the bytes are not re-serialized.

## Calls that send email

These calls put real email on the wire:

- `campaigns.start` (`POST /campaigns/{id}/start`): needs `START_CAMPAIGNS` or `SEND_CAMPAIGNS`.
- `campaigns.update` with `status: "active"` (and `completed` or `paused_undeliverable`): needs `START_CAMPAIGNS` or `SEND_CAMPAIGNS` in addition to `WRITE_CAMPAIGNS`.
- `campaigns.leads.resume` on a finished campaign: needs `START_CAMPAIGNS` or `SEND_CAMPAIGNS`.
- `unibox.reply` and `unibox.approveAgentDraft`: need `WRITE_UNIBOX`. A key with `WRITE_UNIBOX` can send replies from any mailbox it can reach.
- Through `request`: `POST /unibox/compose`, `POST /emails/{id}/send`, `POST /campaigns/{id}/test-email`, the first-email review queue (`/campaigns/{id}/reviews/...`) and placement tests need `SEND_CAMPAIGNS` (compose needs `WRITE_UNIBOX`).

Adding contacts can send mail without calling start: contacts added to an `active` campaign are queued, a `completed` campaign starts again on its own when leads are added, and a contact that comes to match a segment linked to a sending campaign is enrolled. That covers `contacts.create`, `contacts.update` with `campaigns`, and `campaigns.leads.add`.

`START_CAMPAIGNS` starts, resumes and pauses campaigns and nothing else. `SEND_CAMPAIGNS` covers everything `START_CAMPAIGNS` covers plus the other sending actions. `WRITE_CAMPAIGNS` alone edits drafts and pauses, and cannot start anything.

A key for a model that reads the inbox should use the "Agent: read and draft" preset (84574239): every read scope plus `AI_DRAFT`, with nothing that writes or sends.

Some calls spend workspace credits (AI drafts, research, enrichment, paid tools). They answer `402 insufficient_credits` when the balance is out.

Retrying a send without an idempotency key can send twice. Pass an idempotency key on every mutating call you might retry.

## AI tools

`client.aiTools.list({ format: 'openai' })` returns the tools the credential's scopes allow, ready to hand to a model, and `client.aiTools.call(name, args)` runs one. When a result has `untrusted: true`, it holds text written by people outside the workspace: fence it as data before a model reads it. Paid tools need an `idempotency_key` in `args`.

## Examples

- [`examples/list-campaigns.ts`](examples/list-campaigns.ts): list every campaign.
- [`examples/verify-webhook.ts`](examples/verify-webhook.ts): a server that verifies webhook deliveries.

## Links

- API reference: https://docs.ayinbox.com/api/
- Docs: https://docs.ayinbox.com/
- Dashboard: https://app.ayinbox.com
- Contact: team@ayinbox.com

## License

MIT. See [LICENSE](LICENSE).
