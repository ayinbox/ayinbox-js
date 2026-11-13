// Lists every campaign in the workspace.
// Run (Node 22.18+ runs TypeScript directly): AYINBOX_API_KEY=aybox_... node examples/list-campaigns.ts
import { AyInbox } from '../src/index.ts';

const client = new AyInbox();

const me = await client.me.get();
console.log(`Signed in as ${me.email} (${me.organization_name ?? 'no workspace'})`);

for await (const campaign of client.campaigns.list({ limit: 50 })) {
  console.log(`${campaign.status.padEnd(10)} ${campaign.name}`);
}
