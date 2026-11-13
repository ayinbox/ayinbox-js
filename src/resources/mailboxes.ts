import type { PagePromise, RequestOptions } from '../core.ts';
import type { Identity, Mailbox, MailboxListParams, MailboxSync } from '../types.ts';
import { APIResource, pageQuery, seg } from './shared.ts';

export class Me extends APIResource {
  /** `GET /me`: who the credential acts for and its scopes. Needs no scope. */
  get(options?: RequestOptions): Promise<Identity> {
    return this._client._request('GET', '/me', { options });
  }
}

export class Mailboxes extends APIResource {
  /** `GET /emails`. */
  list(params: MailboxListParams = {}, options?: RequestOptions): PagePromise<Mailbox> {
    return this._client._list<Mailbox>('GET', '/emails', pageQuery(params), undefined, options);
  }

  /** `GET /emails/{id}`. */
  get(id: string, options?: RequestOptions): Promise<Mailbox> {
    return this._client._request('GET', `/emails/${seg(id)}`, { options });
  }

  /** `GET /emails/{id}/sync`: sync progress and policy. */
  getSync(id: string, options?: RequestOptions): Promise<MailboxSync> {
    return this._client._request('GET', `/emails/${seg(id)}/sync`, { options });
  }
}
