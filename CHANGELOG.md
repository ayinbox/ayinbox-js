# Changelog

## 0.1.0 (unreleased)

First release.

- `AyInbox` client covering 62 API methods: me, campaigns (with steps and leads), contacts, mailboxes, unibox, templates, webhooks, analytics, suppressions and AI tools.
- Generic `request` and `paginate` for any other route.
- Typed errors, retries that honour `Retry-After`, per-call idempotency keys, timeouts and abort signals.
- Webhook signature verification with Web Crypto and a constant-time compare.
- ESM and CommonJS builds with type declarations, and a `jsr.json` for JSR.
