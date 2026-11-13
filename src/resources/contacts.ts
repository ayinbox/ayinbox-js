import type { PagePromise, RequestOptions } from '../core.ts';
import type {
  Contact,
  ContactDetail,
  ContactInput,
  ContactListParams,
  ContactSelection,
  ContactUpdateParams,
  ContactsPage,
} from '../types.ts';
import { APIResource, pageQuery, seg } from './shared.ts';

export class Contacts extends APIResource {
  /**
   * `POST /contacts/search`. A read: safe to retry without an idempotency key.
   * `cursor`, `limit` and `category` go in the query; every other field is a filter in the body.
   */
  list(params: ContactListParams = {}, options?: RequestOptions): PagePromise<Contact, ContactsPage> {
    const { cursor, limit, category, ...filters } = params;
    return this._client._list<Contact, ContactsPage>(
      'POST',
      '/contacts/search',
      pageQuery({ cursor, limit, category }),
      filters,
      options,
      true,
    );
  }

  /** `GET /contacts/{id}`. */
  get(id: string, options?: RequestOptions): Promise<ContactDetail> {
    return this._client._request('GET', `/contacts/${seg(id)}`, { options });
  }

  /**
   * `POST /contacts`: one contact or up to 10,240, upserted by email. Always resolves to an array.
   * Contacts with an active or completed campaign in `campaigns` can be sent mail.
   */
  create(contacts: ContactInput | ContactInput[], options?: RequestOptions): Promise<Contact[]> {
    return this._client._request('POST', '/contacts', { body: contacts, options });
  }

  /** `PATCH /contacts/{id}`. */
  update(id: string, params: ContactUpdateParams, options?: RequestOptions): Promise<Contact> {
    return this._client._request('PATCH', `/contacts/${seg(id)}`, { body: params, options });
  }

  /** `DELETE /contacts/{id}`. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this._client._request('DELETE', `/contacts/${seg(id)}`, { options });
  }

  /** `DELETE /contacts` with a list of ids or a selection. Needs BULK_CONTACTS. */
  async bulkDelete(selection: string[] | ContactSelection, options?: RequestOptions): Promise<void> {
    await this._client._request('DELETE', '/contacts', { body: selection, options });
  }
}
