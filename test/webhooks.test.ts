import { describe, expect, it } from 'vitest';
import { AyInbox, SignatureVerificationError, computeSignature, constructEvent, verifySignature } from '../src/index.ts';
import { fixture } from './mock-server.ts';

const vector = fixture('webhook_signature.json') as {
  secret: string;
  timestamp: number;
  body: string;
  expected_v1: string;
  header: string;
  tolerance_seconds: number;
};
const now = vector.timestamp;

describe('webhook signatures', () => {
  it('computes the expected digest from the test vector', async () => {
    expect(await computeSignature(vector.body, vector.timestamp, vector.secret)).toBe(vector.expected_v1);
  });

  it('accepts the valid vector as a string and as bytes', async () => {
    expect(await verifySignature(vector.body, vector.header, vector.secret, { now })).toBe(true);
    const bytes = new TextEncoder().encode(vector.body);
    expect(await verifySignature(bytes, vector.header, vector.secret, { now })).toBe(true);
    expect(await verifySignature(bytes.buffer, vector.header, vector.secret, { now })).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const tampered = vector.body.replace('reply_received', 'reply_receivee');
    expect(await verifySignature(tampered, vector.header, vector.secret, { now })).toBe(false);
    expect(await verifySignature(`${vector.body}\n`, vector.header, vector.secret, { now })).toBe(false);
  });

  it('rejects a wrong secret, including the secret without its prefix', async () => {
    expect(await verifySignature(vector.body, vector.header, 'whsec_other', { now })).toBe(false);
    expect(await verifySignature(vector.body, vector.header, 'test_secret', { now })).toBe(false);
  });

  it('enforces the tolerance window', async () => {
    expect(await verifySignature(vector.body, vector.header, vector.secret, { now: now + 300 })).toBe(true);
    expect(await verifySignature(vector.body, vector.header, vector.secret, { now: now + 301 })).toBe(false);
    expect(await verifySignature(vector.body, vector.header, vector.secret, { now: now - 301 })).toBe(false);
    await expect(verifySignature(vector.body, vector.header, vector.secret, { toleranceSeconds: 0 })).rejects.toThrow(
      RangeError,
    );
  });

  it('accepts any matching v1 and ignores other schemes', async () => {
    const header = `t=${now},v0=abc,v1=${'0'.repeat(64)},v1=${vector.expected_v1}`;
    expect(await verifySignature(vector.body, header, vector.secret, { now })).toBe(true);
  });

  it('rejects malformed headers', async () => {
    for (const header of ['', 'garbage', `v1=${vector.expected_v1}`, `t=${now}`, `t=abc,v1=${vector.expected_v1}`]) {
      expect(await verifySignature(vector.body, header, vector.secret, { now })).toBe(false);
    }
    expect(await verifySignature(vector.body, null, vector.secret, { now })).toBe(false);
  });

  it('constructEvent parses a verified body and throws on a bad one', async () => {
    const event = await constructEvent(vector.body, vector.header, vector.secret, { now });
    expect(event.event_type).toBe('campaign.reply_received');
    expect(event.id).toBe('00000000-0000-4000-8000-000000000001');
    await expect(constructEvent(vector.body, vector.header, 'whsec_wrong', { now })).rejects.toBeInstanceOf(
      SignatureVerificationError,
    );
  });

  it('is reachable from the client', async () => {
    const client = new AyInbox({ apiKey: 'aybox_x', baseURL: 'http://127.0.0.1:1/v1' });
    expect(await client.webhooks.verifySignature(vector.body, vector.header, vector.secret, { now })).toBe(true);
    const event = await client.webhooks.constructEvent(vector.body, vector.header, vector.secret, { now });
    expect(event.organization_id).toBe('00000000-0000-4000-8000-0000000000aa');
  });

  it('falls back to node:crypto when globalThis.crypto is missing (Node 18)', async () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    try {
      expect(await verifySignature(vector.body, vector.header, vector.secret, { now })).toBe(true);
    } finally {
      if (desc) Object.defineProperty(globalThis, 'crypto', desc);
    }
  });
});
