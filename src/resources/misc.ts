import type { PagePromise, RequestOptions } from '../core.ts';
import type {
  AccountAnalyticsListParams,
  AiFunctionTool,
  AiTool,
  AiToolCallResult,
  AiToolListParams,
  AnalyticsDashboard,
  AnalyticsDashboardParams,
  CampaignAnalytics,
  DateRangeParams,
  DeliveryListParams,
  EventType,
  JsonObject,
  Suppression,
  SuppressionAddParams,
  SuppressionAddResult,
  SuppressionListParams,
  Template,
  TemplateCreateParams,
  TemplateUpdateParams,
  WebhookCreateParams,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
  WebhookEvent,
  WebhookList,
  WebhookSecret,
  WebhookUpdateParams,
  WebhookVerifyResult,
} from '../types.ts';
import {
  constructEvent,
  verifySignature,
  type VerifySignatureOptions,
  type WebhookPayload,
} from '../webhook-signature.ts';
import { APIResource, pageQuery, seg } from './shared.ts';

export class Templates extends APIResource {
  /** `GET /templates`: every reply template in one response. */
  list(params: { q?: string } = {}, options?: RequestOptions): Promise<{ data: Template[] }> {
    return this._client._request('GET', '/templates', { query: pageQuery(params), options });
  }

  /** `GET /templates/{id}`. */
  get(id: string, options?: RequestOptions): Promise<Template> {
    return this._client._request('GET', `/templates/${seg(id)}`, { options });
  }

  /** `POST /templates`. */
  create(params: TemplateCreateParams, options?: RequestOptions): Promise<Template> {
    return this._client._request('POST', '/templates', { body: params, options });
  }

  /** `PATCH /templates/{id}`. */
  update(id: string, params: TemplateUpdateParams, options?: RequestOptions): Promise<Template> {
    return this._client._request('PATCH', `/templates/${seg(id)}`, { body: params, options });
  }

  /** `DELETE /templates/{id}`. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this._client._request('DELETE', `/templates/${seg(id)}`, { options });
  }
}

export class Webhooks extends APIResource {
  /** `GET /webhooks`: every endpoint plus the event type catalogue. */
  list(options?: RequestOptions): Promise<WebhookList> {
    return this._client._request('GET', '/webhooks', { options });
  }

  /** `POST /webhooks`. The response holds the signing secret, shown only here and on rotate. */
  create(params: WebhookCreateParams, options?: RequestOptions): Promise<WebhookEndpointWithSecret> {
    return this._client._request('POST', '/webhooks', { body: params, options });
  }

  /** `PATCH /webhooks/{id}`. Replaces the endpoint: send the full desired state. */
  update(id: string, params: WebhookUpdateParams, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this._client._request('PATCH', `/webhooks/${seg(id)}`, { body: params, options });
  }

  /** `DELETE /webhooks/{id}`. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this._client._request('DELETE', `/webhooks/${seg(id)}`, { options });
  }

  /** `POST /webhooks/{id}/rotate-secret`. */
  rotateSecret(id: string, options?: RequestOptions): Promise<WebhookSecret> {
    return this._client._request('POST', `/webhooks/${seg(id)}/rotate-secret`, { options });
  }

  /** `POST /webhooks/{id}/verify`: re-sends the verification challenge. */
  verify(id: string, options?: RequestOptions): Promise<WebhookVerifyResult> {
    return this._client._request('POST', `/webhooks/${seg(id)}/verify`, { options });
  }

  /** `GET /webhooks/event-types`. */
  eventTypes(options?: RequestOptions): Promise<{ event_types: EventType[] }> {
    return this._client._request('GET', '/webhooks/event-types', { options });
  }

  /** `GET /webhooks/deliveries`. Filter one endpoint with `endpoint_id`. */
  listDeliveries(params: DeliveryListParams = {}, options?: RequestOptions): PagePromise<WebhookDelivery> {
    return this._client._list<WebhookDelivery>('GET', '/webhooks/deliveries', pageQuery(params), undefined, options);
  }

  /** Checks an `X-Ayinbox-Signature` header against the raw body. Local, no HTTP. */
  verifySignature(
    payload: WebhookPayload,
    header: string | null | undefined,
    secret: string,
    options?: VerifySignatureOptions,
  ): Promise<boolean> {
    return verifySignature(payload, header, secret, options);
  }

  /** Verifies, then parses the event. Throws `SignatureVerificationError`. Local, no HTTP. */
  constructEvent<D = JsonObject>(
    payload: WebhookPayload,
    header: string | null | undefined,
    secret: string,
    options?: VerifySignatureOptions,
  ): Promise<WebhookEvent<D>> {
    return constructEvent<D>(payload, header, secret, options);
  }
}

export class Analytics extends APIResource {
  /** `GET /analytics/dashboard`. */
  dashboard(params: AnalyticsDashboardParams = {}, options?: RequestOptions): Promise<AnalyticsDashboard> {
    return this._client._request('GET', '/analytics/dashboard', { query: pageQuery(params), options });
  }

  /** `GET /analytics/campaigns/{id}`. */
  campaign(id: string, params: DateRangeParams = {}, options?: RequestOptions): Promise<CampaignAnalytics> {
    return this._client._request('GET', `/analytics/campaigns/${seg(id)}`, { query: pageQuery(params), options });
  }

  /** `GET /analytics/campaigns/{id}/daily`. Row shape is not fixed by the spec. */
  campaignDaily(id: string, params: DateRangeParams = {}, options?: RequestOptions): Promise<{ data: JsonObject[] }> {
    return this._client._request('GET', `/analytics/campaigns/${seg(id)}/daily`, {
      query: pageQuery(params),
      options,
    });
  }

  /** `GET /analytics/accounts`: per-mailbox health and usage. Row shape is not fixed by the spec. */
  accounts(params: AccountAnalyticsListParams = {}, options?: RequestOptions): PagePromise<JsonObject> {
    return this._client._list<JsonObject>('GET', '/analytics/accounts', pageQuery(params), undefined, options);
  }

  /** `GET /analytics/accounts/{id}`. Shape is not fixed by the spec. */
  account(id: string, options?: RequestOptions): Promise<JsonObject> {
    return this._client._request('GET', `/analytics/accounts/${seg(id)}`, { options });
  }
}

export class Suppressions extends APIResource {
  /** `GET /suppressions`. */
  list(params: SuppressionListParams = {}, options?: RequestOptions): PagePromise<Suppression> {
    return this._client._list<Suppression>('GET', '/suppressions', pageQuery(params), undefined, options);
  }

  /** `POST /suppressions`: addresses or domains. */
  add(params: SuppressionAddParams, options?: RequestOptions): Promise<SuppressionAddResult> {
    return this._client._request('POST', '/suppressions', { body: params, options });
  }

  /** `DELETE /suppressions/{id}`. Lifting a suppression lets mail reach that recipient again. */
  async remove(id: string, options?: RequestOptions): Promise<void> {
    await this._client._request('DELETE', `/suppressions/${seg(id)}`, { options });
  }
}

export class AiTools extends APIResource {
  /** `GET /ai/tools`: the tools this credential's scopes allow. */
  list(params?: AiToolListParams & { format?: 'ayinbox' }, options?: RequestOptions): Promise<{ data: AiTool[] }>;
  list(
    params: AiToolListParams & { format: 'openai' | 'hermes' | 'functions' },
    options?: RequestOptions,
  ): Promise<{ data: AiFunctionTool[] }>;
  list(params: AiToolListParams = {}, options?: RequestOptions): Promise<{ data: AiTool[] | AiFunctionTool[] }> {
    return this._client._request('GET', '/ai/tools', { query: pageQuery(params), options });
  }

  /** `POST /ai/tools/{name}/call`. Paid tools need `idempotency_key` in `args`. */
  call(name: string, args: JsonObject = {}, options?: RequestOptions): Promise<AiToolCallResult> {
    return this._client._request('POST', `/ai/tools/${seg(name)}/call`, { body: args, options });
  }
}
