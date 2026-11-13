import { SignatureVerificationError } from './errors.ts';
import type { WebhookEvent } from './types.ts';

/** Default allowed clock skew between the signature timestamp and now, in seconds. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

/** Raw webhook body exactly as received: a string, bytes, or an `ArrayBuffer`. */
export type WebhookPayload = string | Uint8Array | ArrayBuffer;

export interface VerifySignatureOptions {
  /** Allowed skew in seconds. Default 300. Must be positive. */
  toleranceSeconds?: number;
  /** Current time in Unix seconds, for tests. Defaults to the clock. */
  now?: number;
}

type Subtle = SubtleCrypto;

async function getSubtle(): Promise<Subtle> {
  const subtle = (globalThis as { crypto?: { subtle?: Subtle } }).crypto?.subtle;
  if (subtle) return subtle;
  // Node 18 has Web Crypto only on the node:crypto module, not on globalThis.
  const specifier = 'node:crypto';
  const mod = (await import(/* @vite-ignore */ specifier)) as { webcrypto: { subtle: Subtle } };
  return mod.webcrypto.subtle;
}

function toBytes(payload: WebhookPayload): Uint8Array {
  if (typeof payload === 'string') return new TextEncoder().encode(payload);
  if (payload instanceof Uint8Array) return payload;
  return new Uint8Array(payload);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseHeader(header: string): { t: number; v1: string[] } | null {
  let t: number | undefined;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && /^\d+$/.test(value)) t = Number(value);
    else if (key === 'v1' && value !== '') v1.push(value.toLowerCase());
  }
  if (t === undefined || v1.length === 0) return null;
  return { t, v1 };
}

/** Computes the lowercase hex HMAC-SHA256 of `<timestamp>.<body>` keyed by the full secret (with `whsec_`). */
export async function computeSignature(payload: WebhookPayload, timestamp: number, secret: string): Promise<string> {
  const subtle = await getSubtle();
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prefix = enc.encode(`${timestamp}.`);
  const body = toBytes(payload);
  const message = new Uint8Array(prefix.byteLength + body.byteLength);
  message.set(prefix, 0);
  message.set(body, prefix.byteLength);
  return toHex(await subtle.sign('HMAC', key, message));
}

/**
 * Checks an `X-Ayinbox-Signature` header against the raw request body.
 * Pass the body before any JSON parsing. Resolves `false` on any mismatch, malformed header or stale timestamp.
 */
export async function verifySignature(
  payload: WebhookPayload,
  header: string | null | undefined,
  secret: string,
  options: VerifySignatureOptions = {},
): Promise<boolean> {
  const tolerance = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  if (!(tolerance > 0)) throw new RangeError('toleranceSeconds must be a positive number.');
  if (!header || !secret) return false;
  const parsed = parseHeader(header);
  if (!parsed) return false;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.t) > tolerance) return false;
  const expected = await computeSignature(payload, parsed.t, secret);
  let match = false;
  for (const candidate of parsed.v1) {
    if (timingSafeEqual(expected, candidate)) match = true;
  }
  return match;
}

/** Verifies the signature, then parses the body. Throws `SignatureVerificationError` when it does not verify. */
export async function constructEvent<D = Record<string, unknown>>(
  payload: WebhookPayload,
  header: string | null | undefined,
  secret: string,
  options: VerifySignatureOptions = {},
): Promise<WebhookEvent<D>> {
  if (!(await verifySignature(payload, header, secret, options))) {
    throw new SignatureVerificationError('Webhook signature verification failed.');
  }
  const text = typeof payload === 'string' ? payload : new TextDecoder().decode(toBytes(payload));
  try {
    return JSON.parse(text) as WebhookEvent<D>;
  } catch (err) {
    throw new SignatureVerificationError('Webhook body is not valid JSON.', { cause: err });
  }
}
