import type { Core, Query } from '../core.ts';

export abstract class APIResource {
  protected readonly _client: Core;

  constructor(client: Core) {
    this._client = client;
  }
}

/** Encodes one path segment. */
export function seg(value: string): string {
  if (typeof value !== 'string' || value === '') throw new TypeError('A path id must be a non-empty string.');
  return encodeURIComponent(value);
}

/** Drops undefined values and keeps the rest as query parameters. */
export function pageQuery(params: object): Query {
  const out: Query = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = v as Query[string];
  }
  return out;
}
