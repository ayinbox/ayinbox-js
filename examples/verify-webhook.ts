// A small HTTP server that verifies AY Inbox webhook deliveries.
// Run (Node 22.18+ runs TypeScript directly): AYINBOX_WEBHOOK_SECRET=whsec_... node examples/verify-webhook.ts
import { createServer } from 'node:http';
import { SignatureVerificationError, constructEvent } from '../src/index.ts';

const secret = process.env['AYINBOX_WEBHOOK_SECRET'];
if (!secret) throw new Error('Set AYINBOX_WEBHOOK_SECRET to the endpoint secret (whsec_...).');

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', async () => {
    // Verify the raw bytes, before any JSON parsing.
    const body = new Uint8Array(Buffer.concat(chunks));
    try {
      const event = await constructEvent(body, req.headers['x-ayinbox-signature'] as string | undefined, secret);
      console.log(`${event.event_type} ${event.id}`);
      res.writeHead(200).end();
    } catch (err) {
      if (err instanceof SignatureVerificationError) {
        res.writeHead(400).end('bad signature');
        return;
      }
      throw err;
    }
  });
}).listen(3000, () => console.log('Listening on http://localhost:3000'));
