import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AyInbox } from '../src/index.ts';
import { MockServer } from './mock-server.ts';

const server = new MockServer();
const CID = '11111111-1111-4111-8111-111111111111';
const LEAD = '22222222-2222-4222-8222-111111111111';
let client: AyInbox;

beforeAll(async () => {
  await server.start();
  client = new AyInbox({ apiKey: 'aybox_test', baseURL: server.baseURL, maxRetries: 0 });
});
afterAll(() => server.stop());
afterEach(() => server.reset());

function sent(): { method: string; path: string; json: unknown } {
  const { method, path, json } = server.last;
  return { method, path, json };
}

describe('me', () => {
  it('get', async () => {
    const me = await client.me.get();
    expect(me.auth_type).toBe('api_key');
    expect(Array.isArray(me.scopes)).toBe(true);
  });
});

describe('campaigns', () => {
  it('list filters', async () => {
    const page = await client.campaigns.list({ status: 'active', q: 'Q4', limit: 25 });
    expect(page.data[0]?.id).toBeTypeOf('string');
    expect(page.pagination.total).toBe(3);
    expect(Object.fromEntries(server.last.query)).toEqual({ status: 'active', q: 'Q4', limit: '25' });
  });

  it('get, create, update, delete', async () => {
    expect((await client.campaigns.get(CID)).id).toBe(CID);
    expect(sent().path).toBe(`/v1/campaigns/${CID}`);

    const created = await client.campaigns.create(
      { name: 'Q4 outreach', daily_limit: 30, steps: [{ subject: 'Hi', body_plain: 'Hello', wait_after: 3 }] },
      { idempotencyKey: 'create-1' },
    );
    expect(created.name).toBeTypeOf('string');
    expect(sent()).toMatchObject({ method: 'POST', path: '/v1/campaigns', json: { name: 'Q4 outreach', daily_limit: 30 } });

    await client.campaigns.update(CID, { stop_on_reply: false });
    expect(sent()).toEqual({ method: 'PATCH', path: `/v1/campaigns/${CID}`, json: { stop_on_reply: false } });

    await expect(client.campaigns.delete(CID)).resolves.toBeUndefined();
    expect(sent().method).toBe('DELETE');
  });

  it('start, pause, duplicate, overview', async () => {
    const started = await client.campaigns.start(CID, { acknowledge_list_risk: true }, { idempotencyKey: 's1' });
    expect(started).toEqual({ status: 'started', waiting_for_leads: false });
    expect(sent()).toEqual({ method: 'POST', path: `/v1/campaigns/${CID}/start`, json: { acknowledge_list_risk: true } });

    expect((await client.campaigns.pause(CID)).status).toBe('stopped');
    expect(sent().path).toBe(`/v1/campaigns/${CID}/stop`);

    const copy = await client.campaigns.duplicate(CID, { name: 'Copy' });
    expect(copy.id).toBeTypeOf('string');
    expect(sent()).toEqual({ method: 'POST', path: `/v1/campaigns/${CID}/duplicate`, json: { name: 'Copy' } });

    const overview = await client.campaigns.overview();
    expect(overview.total).toBe(3);
    expect(sent().path).toBe('/v1/campaigns-overview');
  });
});

describe('campaigns.steps', () => {
  it('list, create, update, delete', async () => {
    const steps = await client.campaigns.steps.list(CID);
    expect(steps).toHaveLength(2);
    const step = await client.campaigns.steps.create(CID, { subject: 'Follow up', wait_after: 2 });
    expect(step.id).toBeTypeOf('string');
    expect(sent()).toEqual({ method: 'POST', path: `/v1/campaigns/${CID}/steps`, json: { subject: 'Follow up', wait_after: 2 } });
    await client.campaigns.steps.update(CID, 'step-1', { conditions: {} });
    expect(sent()).toEqual({ method: 'PATCH', path: `/v1/campaigns/${CID}/steps/step-1`, json: { conditions: {} } });
    await expect(client.campaigns.steps.delete(CID, 'step-1')).resolves.toBeUndefined();
  });
});

describe('campaigns.leads', () => {
  it('list sends exactly one campaign id in the body', async () => {
    const page = await client.campaigns.leads.list(CID, { lead_status: 'replied', limit: 10 });
    expect(page.data[0]?.campaign_lead?.status).toBeTypeOf('string');
    expect(sent()).toEqual({
      method: 'POST',
      path: '/v1/contacts/search',
      json: { lead_status: 'replied', campaign_ids: [CID] },
    });
    expect(server.last.query.get('limit')).toBe('10');
  });

  it('add attaches the campaign to every contact', async () => {
    const out = await client.campaigns.leads.add(CID, [{ email: 'a@example.com' }, { email: 'b@example.com', campaigns: ['other'] }]);
    expect(Array.isArray(out)).toBe(true);
    expect(sent().json).toEqual([
      { email: 'a@example.com', campaigns: [CID] },
      { email: 'b@example.com', campaigns: ['other', CID] },
    ]);
  });

  it('getHold, pause, resume', async () => {
    const hold = await client.campaigns.leads.getHold(CID, LEAD);
    expect(hold.hold?.source).toBe('manual');
    expect(sent().path).toBe(`/v1/campaigns/${CID}/leads/${LEAD}/hold`);
    await client.campaigns.leads.pause(CID, LEAD, { until: new Date('2026-11-20T00:00:00Z'), reason: 'OOO' });
    expect(sent()).toEqual({
      method: 'POST',
      path: `/v1/campaigns/${CID}/leads/${LEAD}/pause`,
      json: { until: '2026-11-20T00:00:00.000Z', reason: 'OOO' },
    });
    await client.campaigns.leads.resume(CID, LEAD);
    expect(sent()).toEqual({ method: 'POST', path: `/v1/campaigns/${CID}/leads/${LEAD}/resume`, json: undefined });
  });
});

describe('contacts', () => {
  it('list splits query and body', async () => {
    const page = await client.contacts.list({ category: 'cat-1', limit: 5, subscribed: true });
    expect(page.response.counts).toBeDefined();
    expect(sent().json).toEqual({ subscribed: true });
    expect(Object.fromEntries(server.last.query)).toEqual({ category: 'cat-1', limit: '5' });
  });

  it('get, create, update, delete, bulkDelete', async () => {
    const detail = await client.contacts.get(LEAD);
    expect(detail.email).toBeTypeOf('string');
    const created = await client.contacts.create({ email: 'lee@example.com', custom_fields: { title: 'Ops' } }, { idempotencyKey: 'c-1' });
    expect(created[0]?.id).toBe(LEAD);
    expect(sent().json).toEqual({ email: 'lee@example.com', custom_fields: { title: 'Ops' } });
    const updated = await client.contacts.update(LEAD, { add_categories: ['cat-1'] });
    expect(updated.id).toBe(LEAD);
    await client.contacts.delete(LEAD);
    expect(sent()).toEqual({ method: 'DELETE', path: `/v1/contacts/${LEAD}`, json: undefined });
    await client.contacts.bulkDelete([LEAD, 'other']);
    expect(sent()).toEqual({ method: 'DELETE', path: '/v1/contacts', json: [LEAD, 'other'] });
    await client.contacts.bulkDelete({ all: true, filters: { subscribed: false }, exclude: [LEAD] });
    expect(sent().json).toEqual({ all: true, filters: { subscribed: false }, exclude: [LEAD] });
  });
});

describe('mailboxes', () => {
  it('list, get, getSync', async () => {
    const page = await client.mailboxes.list({ q: 'sales' });
    expect(page.data[0]?.email).toBeTypeOf('string');
    expect(sent().path).toBe('/v1/emails');
    const box = await client.mailboxes.get('m1');
    expect(box.provider).toBeTypeOf('string');
    const sync = await client.mailboxes.getSync('m1');
    expect(sync.policy.daily_messages).toBe(2000);
    expect(sent().path).toBe('/v1/emails/m1/sync');
  });
});

describe('unibox', () => {
  it('threads, thread, message, count', async () => {
    const threads = await client.unibox.listThreads({ folder: 'inbox', awaiting_reply: true });
    expect(threads.data.length).toBeGreaterThan(0);
    expect(server.last.query.get('folder')).toBe('inbox');
    const thread = await client.unibox.getThread({ thread_id: 'thread-abc' });
    expect(thread.data.length).toBeGreaterThan(0);
    expect(sent().path).toBe('/v1/unibox/thread');
    expect(server.last.query.get('thread_id')).toBe('thread-abc');
    const msg = await client.unibox.getMessage('msg-1');
    expect(msg.body_html).toBeTypeOf('string');
    expect((await client.unibox.unreadCount({ email_id: 'm1' })).count).toBe(3);
    expect(sent().path).toBe('/v1/unibox/count');
  });

  it('reply', async () => {
    const res = await client.unibox.reply(
      { email_account_id: 'm1', to: ['lee@example.com'], subject: 'Re: hi', body_plain: 'Thanks' },
      { idempotencyKey: 'reply-1' },
    );
    expect(res.task_id).toBeTypeOf('string');
    expect(server.last.headers['idempotency-key']).toBe('reply-1');
  });

  it('drafts and agent drafts', async () => {
    expect(Array.isArray((await client.unibox.listDrafts()).data)).toBe(true);
    expect(await client.unibox.saveDraft('d1', { subject: 'x', body: 'y' })).toEqual({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-111111111111' });
    expect(sent()).toEqual({ method: 'PUT', path: '/v1/unibox/drafts/d1', json: { subject: 'x', body: 'y' } });
    expect(await client.unibox.deleteDraft('d1')).toEqual({ deleted: true });
    expect(Array.isArray((await client.unibox.listAgentDrafts()).data)).toBe(true);
    const approved = await client.unibox.approveAgentDraft('a1', { acknowledge_flags: true }, { idempotencyKey: 'ap-1' });
    expect(approved.send_mode).toBe('instant');
    expect(sent()).toEqual({ method: 'POST', path: '/v1/unibox/agent-drafts/a1/approve', json: { acknowledge_flags: true } });
    expect(await client.unibox.discardAgentDraft('a1')).toEqual({ status: 'discarded' });
  });
});

describe('templates', () => {
  it('list, get, create, update, delete', async () => {
    expect(Array.isArray((await client.templates.list({ q: 'intro' })).data)).toBe(true);
    expect(server.last.query.get('q')).toBe('intro');
    expect((await client.templates.get('t1')).name).toBeTypeOf('string');
    await client.templates.create({ name: 'Intro', subject: 'Hello' });
    expect(sent()).toEqual({ method: 'POST', path: '/v1/templates', json: { name: 'Intro', subject: 'Hello' } });
    await client.templates.update('t1', { body_plain: 'Hi' });
    expect(sent().method).toBe('PATCH');
    await expect(client.templates.delete('t1')).resolves.toBeUndefined();
  });
});

describe('webhooks', () => {
  it('list, create, update, delete, rotate, verify, event types, deliveries', async () => {
    const list = await client.webhooks.list();
    expect(Array.isArray(list.endpoints)).toBe(true);
    const created = await client.webhooks.create({ url: 'https://hooks.example.com/ayinbox', event_types: ['campaign.reply_received'] });
    expect(created.secret).toMatch(/^whsec_/);
    const updated = await client.webhooks.update('w1', { url: 'https://hooks.example.com/ayinbox', enabled: false });
    expect(updated.id).toBeTypeOf('string');
    expect(sent()).toEqual({
      method: 'PATCH',
      path: '/v1/webhooks/w1',
      json: { url: 'https://hooks.example.com/ayinbox', enabled: false },
    });
    await expect(client.webhooks.delete('w1')).resolves.toBeUndefined();
    expect((await client.webhooks.rotateSecret('w1')).secret).toMatch(/^whsec_/);
    expect(await client.webhooks.verify('w1')).toEqual({ status: 'challenge_sent' });
    expect(Array.isArray((await client.webhooks.eventTypes()).event_types)).toBe(true);
    const deliveries = await client.webhooks.listDeliveries({ status: 'failed', endpoint_id: 'w1' });
    expect(Array.isArray(deliveries.data)).toBe(true);
    expect(Object.fromEntries(server.last.query)).toEqual({ status: 'failed', endpoint_id: 'w1' });
  });
});

describe('analytics', () => {
  it('dashboard and campaign', async () => {
    const dash = await client.analytics.dashboard({ period: '30d', campaign_ids: ['a', 'b'] });
    expect(dash.overall_stats.total_emails_sent).toBeTypeOf('number');
    expect(server.last.query.get('campaign_ids')).toBe('a,b');
    const camp = await client.analytics.campaign(CID, { from: '2026-11-01', to: '2026-11-13' });
    expect(camp.summary.emails_sent).toBeTypeOf('number');
    expect(Object.fromEntries(server.last.query)).toEqual({ from: '2026-11-01', to: '2026-11-13' });
  });

  it('campaignDaily, accounts and account keep unknown shapes', async () => {
    server.queue.push({ status: 200, body: { data: [{ day: '2026-11-01', sent: 4 }] } });
    expect((await client.analytics.campaignDaily(CID)).data[0]).toEqual({ day: '2026-11-01', sent: 4 });
    expect(sent().path).toBe(`/v1/analytics/campaigns/${CID}/daily`);
    server.queue.push({ status: 200, body: { data: [{ email_id: 'm1' }], pagination: { next_cursor: null, has_more: false } } });
    const accounts = await client.analytics.accounts({ email_ids: ['m1', 'm2'] });
    expect(accounts.data).toHaveLength(1);
    expect(server.last.query.get('email_ids')).toBe('m1,m2');
    server.queue.push({ status: 200, body: { email_id: 'm1', anything: { nested: true } } });
    expect(await client.analytics.account('m1')).toEqual({ email_id: 'm1', anything: { nested: true } });
  });
});

describe('suppressions', () => {
  it('list, add, remove', async () => {
    const page = await client.suppressions.list({ q: 'example.org' });
    expect(page.hasNextPage()).toBe(false);
    const added = await client.suppressions.add({ entries: [{ value: 'example.org' }], reason: 'asked' });
    expect(added.added).toBe(1);
    expect(sent().json).toEqual({ entries: [{ value: 'example.org' }], reason: 'asked' });
    await expect(client.suppressions.remove('s1')).resolves.toBeUndefined();
  });
});

describe('aiTools', () => {
  it('list and call', async () => {
    const tools = await client.aiTools.list({ toolsets: ['inbox', 'campaigns'] });
    expect(Array.isArray(tools.data)).toBe(true);
    expect(server.last.query.get('toolsets')).toBe('inbox,campaigns');
    const res = await client.aiTools.call('list_campaigns', { limit: 5 });
    expect(res.data.untrusted).toBe(false);
    expect(res.data.result).toEqual({ campaigns: [] });
    expect(sent()).toEqual({ method: 'POST', path: '/v1/ai/tools/list_campaigns/call', json: { limit: 5 } });
  });
});
