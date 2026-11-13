import type { PagePromise, RequestOptions } from '../core.ts';
import type {
  Campaign,
  CampaignCreateParams,
  CampaignDuplicateParams,
  CampaignListParams,
  CampaignStartParams,
  CampaignStartResult,
  CampaignStopResult,
  CampaignUpdateParams,
  CampaignsOverview,
  Contact,
  ContactInput,
  ContactsPage,
  LeadHoldState,
  LeadListParams,
  LeadPauseParams,
  Step,
  StepUpdateParams,
} from '../types.ts';
import { APIResource, pageQuery, seg } from './shared.ts';

export class Steps extends APIResource {
  /** `GET /campaigns/{id}/steps`: every step in canvas order. */
  list(campaignId: string, options?: RequestOptions): Promise<Step[]> {
    return this._client._request('GET', `/campaigns/${seg(campaignId)}/steps`, { options });
  }

  /** `POST /campaigns/{id}/steps`: a new step, not connected to the previous one. */
  create(campaignId: string, params: StepUpdateParams = {}, options?: RequestOptions): Promise<Step> {
    return this._client._request('POST', `/campaigns/${seg(campaignId)}/steps`, { body: params, options });
  }

  /** `PATCH /campaigns/{id}/steps/{stepId}`. */
  update(campaignId: string, stepId: string, params: StepUpdateParams, options?: RequestOptions): Promise<Step> {
    return this._client._request('PATCH', `/campaigns/${seg(campaignId)}/steps/${seg(stepId)}`, {
      body: params,
      options,
    });
  }

  /** `DELETE /campaigns/{id}/steps/{stepId}`. */
  async delete(campaignId: string, stepId: string, options?: RequestOptions): Promise<void> {
    await this._client._request('DELETE', `/campaigns/${seg(campaignId)}/steps/${seg(stepId)}`, { options });
  }
}

export class Leads extends APIResource {
  /** Contacts in one campaign, each with `campaign_lead` progress (`POST /contacts/search`). */
  list(campaignId: string, params: LeadListParams = {}, options?: RequestOptions): PagePromise<Contact, ContactsPage> {
    const { cursor, limit, ...filters } = params;
    return this._client._list<Contact, ContactsPage>(
      'POST',
      '/contacts/search',
      pageQuery({ cursor, limit }),
      { ...filters, campaign_ids: [campaignId] },
      options,
      true,
    );
  }

  /**
   * Adds contacts to a campaign (`POST /contacts`, upsert by email).
   * Adding leads to an active campaign queues mail, and a completed campaign starts again.
   */
  add(campaignId: string, contacts: ContactInput | ContactInput[], options?: RequestOptions): Promise<Contact[]> {
    const list = Array.isArray(contacts) ? contacts : [contacts];
    const body = list.map((c) => ({
      ...c,
      campaigns: [...new Set([...(c.campaigns ?? []), campaignId])],
    }));
    return this._client._request('POST', '/contacts', { body, options });
  }

  /** `GET /campaigns/{id}/leads/{contactId}/hold`. */
  getHold(campaignId: string, contactId: string, options?: RequestOptions): Promise<LeadHoldState> {
    return this._client._request('GET', `/campaigns/${seg(campaignId)}/leads/${seg(contactId)}/hold`, { options });
  }

  /** `POST /campaigns/{id}/leads/{contactId}/pause`: holds one lead. */
  pause(
    campaignId: string,
    contactId: string,
    params: LeadPauseParams = {},
    options?: RequestOptions,
  ): Promise<LeadHoldState> {
    return this._client._request('POST', `/campaigns/${seg(campaignId)}/leads/${seg(contactId)}/pause`, {
      body: params,
      options,
    });
  }

  /** `POST /campaigns/{id}/leads/{contactId}/resume`. On a finished campaign this can restart it and send mail. */
  resume(campaignId: string, contactId: string, options?: RequestOptions): Promise<LeadHoldState> {
    return this._client._request('POST', `/campaigns/${seg(campaignId)}/leads/${seg(contactId)}/resume`, {
      options,
    });
  }
}

export class Campaigns extends APIResource {
  readonly steps: Steps = new Steps(this._client);
  readonly leads: Leads = new Leads(this._client);

  /** `GET /campaigns`. */
  list(params: CampaignListParams = {}, options?: RequestOptions): PagePromise<Campaign> {
    return this._client._list<Campaign>('GET', '/campaigns', pageQuery(params), undefined, options);
  }

  /** `GET /campaigns/{id}`. */
  get(id: string, options?: RequestOptions): Promise<Campaign> {
    return this._client._request('GET', `/campaigns/${seg(id)}`, { options });
  }

  /** `POST /campaigns`. Creating never sends mail. */
  create(params: CampaignCreateParams, options?: RequestOptions): Promise<Campaign> {
    return this._client._request('POST', '/campaigns', { body: params, options });
  }

  /** `PATCH /campaigns/{id}`. `status: 'active'` runs the start path and can send mail. */
  update(id: string, params: CampaignUpdateParams, options?: RequestOptions): Promise<Campaign> {
    return this._client._request('PATCH', `/campaigns/${seg(id)}`, { body: params, options });
  }

  /** `DELETE /campaigns/{id}`. Permanent. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this._client._request('DELETE', `/campaigns/${seg(id)}`, { options });
  }

  /** `POST /campaigns/{id}/start`. Sends real mail. Needs START_CAMPAIGNS or SEND_CAMPAIGNS. */
  start(id: string, params?: CampaignStartParams, options?: RequestOptions): Promise<CampaignStartResult> {
    return this._client._request('POST', `/campaigns/${seg(id)}/start`, { body: params, options });
  }

  /** `POST /campaigns/{id}/stop`: pauses an active campaign. Sends nothing. */
  pause(id: string, options?: RequestOptions): Promise<CampaignStopResult> {
    return this._client._request('POST', `/campaigns/${seg(id)}/stop`, { options });
  }

  /** `POST /campaigns/{id}/duplicate`: a new draft copy. */
  duplicate(id: string, params?: CampaignDuplicateParams, options?: RequestOptions): Promise<Campaign> {
    return this._client._request('POST', `/campaigns/${seg(id)}/duplicate`, { body: params, options });
  }

  /** `GET /campaigns-overview`: counts by status. */
  overview(options?: RequestOptions): Promise<CampaignsOverview> {
    return this._client._request('GET', '/campaigns-overview', { options });
  }
}

