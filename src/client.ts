import { Core, type ClientOptions } from './core.ts';
import { Campaigns } from './resources/campaigns.ts';
import { Contacts } from './resources/contacts.ts';
import { Mailboxes, Me } from './resources/mailboxes.ts';
import { AiTools, Analytics, Suppressions, Templates, Webhooks } from './resources/misc.ts';
import { Unibox } from './resources/unibox.ts';

/**
 * Client for the AY Inbox REST API.
 *
 * ```ts
 * const client = new AyInbox(); // reads AYINBOX_API_KEY
 * const me = await client.me.get();
 * ```
 */
export class AyInbox extends Core {
  readonly me: Me = new Me(this);
  readonly campaigns: Campaigns = new Campaigns(this);
  readonly contacts: Contacts = new Contacts(this);
  readonly mailboxes: Mailboxes = new Mailboxes(this);
  readonly unibox: Unibox = new Unibox(this);
  readonly templates: Templates = new Templates(this);
  readonly webhooks: Webhooks = new Webhooks(this);
  readonly analytics: Analytics = new Analytics(this);
  readonly suppressions: Suppressions = new Suppressions(this);
  readonly aiTools: AiTools = new AiTools(this);

  constructor(options: ClientOptions = {}) {
    super(options);
  }
}
