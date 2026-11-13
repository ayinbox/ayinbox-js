import type { PagePromise, RequestOptions } from '../core.ts';
import type {
  AgentDraft,
  AgentDraftApproveParams,
  Draft,
  DraftSaveParams,
  Message,
  MessagePreview,
  ReplyParams,
  SendResult,
  ThreadGetParams,
  ThreadListParams,
  UnreadCount,
  UnreadCountParams,
} from '../types.ts';
import { APIResource, pageQuery, seg } from './shared.ts';

export class Unibox extends APIResource {
  /** `GET /unibox`: one row per conversation. Spam, trash and archive are left out by default. */
  listThreads(params: ThreadListParams = {}, options?: RequestOptions): PagePromise<MessagePreview> {
    return this._client._list<MessagePreview>('GET', '/unibox', pageQuery(params), undefined, options);
  }

  /** `GET /unibox/thread`: the messages of one thread, as previews. */
  getThread(params: ThreadGetParams, options?: RequestOptions): PagePromise<MessagePreview> {
    return this._client._list<MessagePreview>('GET', '/unibox/thread', pageQuery(params), undefined, options);
  }

  /** `GET /unibox/{id}`: one full message. Reading marks it read for an unrestricted caller. */
  getMessage(id: string, options?: RequestOptions): Promise<Message> {
    return this._client._request('GET', `/unibox/${seg(id)}`, { options });
  }

  /** `GET /unibox/count`. */
  unreadCount(params: UnreadCountParams = {}, options?: RequestOptions): Promise<UnreadCount> {
    return this._client._request('GET', '/unibox/count', { query: pageQuery(params), options });
  }

  /** `POST /unibox/reply`. Sends real mail. Pass an idempotency key. */
  reply(params: ReplyParams, options?: RequestOptions): Promise<SendResult> {
    return this._client._request('POST', '/unibox/reply', { body: params, options });
  }

  /** `GET /unibox/drafts`: the calling user's drafts. Not paginated. */
  listDrafts(options?: RequestOptions): Promise<{ data: Draft[] }> {
    return this._client._request('GET', '/unibox/drafts', { options });
  }

  /** `PUT /unibox/drafts/{id}`: create or replace a draft under an id you generate. Never sends. */
  saveDraft(id: string, params: DraftSaveParams, options?: RequestOptions): Promise<{ id: string }> {
    return this._client._request('PUT', `/unibox/drafts/${seg(id)}`, { body: params, options });
  }

  /** `DELETE /unibox/drafts/{id}`. Deleting a missing draft is a no-op. */
  deleteDraft(id: string, options?: RequestOptions): Promise<{ deleted: boolean }> {
    return this._client._request('DELETE', `/unibox/drafts/${seg(id)}`, { options });
  }

  /** `GET /unibox/agent-drafts`: AI reply drafts waiting for a person. Not paginated. */
  listAgentDrafts(options?: RequestOptions): Promise<{ data: AgentDraft[] }> {
    return this._client._request('GET', '/unibox/agent-drafts', { options });
  }

  /** `POST /unibox/agent-drafts/{id}/approve`. Sends real mail. */
  approveAgentDraft(id: string, params: AgentDraftApproveParams = {}, options?: RequestOptions): Promise<SendResult> {
    return this._client._request('POST', `/unibox/agent-drafts/${seg(id)}/approve`, { body: params, options });
  }

  /** `POST /unibox/agent-drafts/{id}/discard`. */
  discardAgentDraft(id: string, options?: RequestOptions): Promise<{ status: string }> {
    return this._client._request('POST', `/unibox/agent-drafts/${seg(id)}/discard`, { options });
  }
}
