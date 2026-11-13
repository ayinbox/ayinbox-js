// Response and request shapes for the AY Inbox REST API (v1).
// Fields the server leaves out may be absent at runtime; unknown fields are kept as they arrive.

/** RFC 3339 timestamp string, for example `2026-11-13T09:30:00Z`. */
export type DateTimeString = string;
/** A timestamp you send: an RFC 3339 string or a `Date` (serialized with `toISOString`). */
export type DateTimeInput = string | Date;
/** Untyped JSON object, used where the API's shape is not fixed. */
export type JsonObject = Record<string, unknown>;

// ---------------------------------------------------------------- pagination

export interface Pagination {
  /** Opaque cursor for the next page, or `null` when there is none. */
  next_cursor: string | null;
  has_more: boolean;
  /** Present on some lists only. Never rely on it. */
  total?: number | null;
}

export interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
  [key: string]: unknown;
}

export interface PageParams {
  /** `pagination.next_cursor` from the previous page, passed back unchanged. */
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------- me

export interface Identity {
  user_id: string;
  email: string;
  name: string;
  first_name: string;
  last_name: string;
  organization_id?: string;
  organization_name?: string;
  auth_type: 'api_key' | 'oauth' | 'jwt' | (string & {});
  /** Lowercased permission names, sorted. */
  scopes: string[];
}

// ---------------------------------------------------------------- campaigns

export type CampaignStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'paused_undeliverable'
  | 'paused_guardrail'
  | 'paused_no_accounts'
  | (string & {});

export interface ScheduleWindow {
  /** Minutes since local midnight. */
  start: number;
  end: number;
}

export interface CampaignSender {
  email_account_id: string;
  weight: number;
  enabled: boolean;
  last_sent_at?: DateTimeString;
}

export interface Campaign {
  id: string;
  user_id: string;
  organization_id?: string;
  name: string;
  description: string;
  status: CampaignStatus;
  stop_on_reply: boolean;
  stop_on_meeting: boolean;
  open_tracking: boolean;
  link_tracking: boolean;
  text_only: boolean;
  unsubscribe_header: boolean;
  risky_emails: boolean;
  daily_limit: number;
  unsubscribe_mode: 'inherit' | 'text' | 'link' | 'off' | (string & {});
  cc: string[];
  bcc: string[];
  start_date: DateTimeString | null;
  end_date: DateTimeString | null;
  timezone: string;
  effective_timezone: string;
  days: number;
  start_time: string;
  end_time: string;
  /** Seven arrays (index 0 = Sunday). When non-empty it is the schedule. */
  schedule_windows: ScheduleWindow[][];
  email_tags: string[];
  folders: string[];
  contact_order_by: string;
  contact_order_dir: string;
  contact_order_field?: string;
  sender_strategy: 'tags' | 'explicit' | (string & {});
  rotation_mode: string;
  senders?: CampaignSender[];
  ramp_enabled: boolean;
  ramp_start: number;
  ramp_increment: number;
  ramp_ceiling: number;
  ramp_level: number;
  ramp_level_date?: DateTimeString;
  esp_match_mode: 'off' | 'prefer' | 'strict' | (string & {});
  max_new_leads_per_day: number;
  prioritize_new_leads: boolean;
  continuous: boolean;
  review_first_emails: boolean;
  entry_delay_minutes: number;
  idle_since?: DateTimeString;
  guardrail_enabled: boolean;
  guardrail_bounce_rate_max: number;
  guardrail_complaint_rate_max: number;
  guardrail_reply_rate_min: number;
  guardrail_min_sample: number;
  guardrail_window_days: number;
  guardrail_tripped_at?: DateTimeString;
  guardrail_reason?: string;
  tracking_domain: string;
  tracking_domain_verified: boolean;
  tracking_domain_verified_at?: DateTimeString;
  utm_tracking: boolean;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  last_status_change_at?: DateTimeString;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

export interface CampaignListParams extends PageParams {
  /** Name search. */
  q?: string;
  status?: 'draft' | 'active' | 'paused' | 'completed';
  /** Folder uuid. */
  folder?: string;
}

export interface SenderInput {
  email_account_id: string;
  weight?: number;
  enabled?: boolean;
}

export interface StepInput {
  name?: string;
  subject?: string;
  body_plain?: string;
  body_html?: string;
  body_sync?: boolean;
  body_code?: boolean;
  /** Days to wait after this step. */
  wait_after?: number;
  /** Defaults to true. */
  thread_reply?: boolean;
}

interface CampaignSettings {
  description?: string;
  stop_on_reply?: boolean;
  stop_on_meeting?: boolean;
  open_tracking?: boolean;
  link_tracking?: boolean;
  text_only?: boolean;
  unsubscribe_header?: boolean;
  risky_emails?: boolean;
  /** Per mailbox, 3 to 5000. */
  daily_limit?: number;
  unsubscribe_mode?: 'inherit' | 'text' | 'link' | 'off';
  cc?: string[];
  bcc?: string[];
  timezone?: string;
  days?: number;
  start_time?: string;
  end_time?: string;
  schedule_windows?: ScheduleWindow[][];
  sender_strategy?: 'tags' | 'explicit';
  rotation_mode?: string;
  ramp_enabled?: boolean;
  ramp_start?: number;
  ramp_increment?: number;
  ramp_ceiling?: number;
  esp_match_mode?: 'off' | 'prefer' | 'strict';
  max_new_leads_per_day?: number;
  prioritize_new_leads?: boolean;
  entry_delay_minutes?: number;
  continuous?: boolean;
  review_first_emails?: boolean;
  tracking_domain?: string;
  utm_tracking?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface CampaignCreateParams extends CampaignSettings {
  name: string;
  start_date?: DateTimeInput;
  end_date?: DateTimeInput;
  email_tag_ids?: string[];
  folder_ids?: string[];
  senders?: SenderInput[];
  /** Created in order and connected in order. */
  steps?: StepInput[];
  /** A/B variants of the first step. Shape not fixed by the spec; passed through. */
  variants?: unknown[];
  /** Passed through as given. */
  advanced_overrides?: JsonObject;
}

export interface CampaignUpdateParams extends CampaignSettings {
  name?: string;
  /** `active`, `completed` or `paused_undeliverable` also need START_CAMPAIGNS or SEND_CAMPAIGNS. `active` can send mail. */
  status?: CampaignStatus;
  /** Pass `null` to clear. */
  start_date?: DateTimeInput | null;
  /** Pass `null` to clear. */
  end_date?: DateTimeInput | null;
  email_tags?: string[];
  folders?: string[];
  contact_order_by?: string;
  contact_order_dir?: string;
  contact_order_field?: string;
  guardrail_enabled?: boolean;
  guardrail_bounce_rate_max?: number;
  guardrail_complaint_rate_max?: number;
  guardrail_reply_rate_min?: number;
  guardrail_min_sample?: number;
  guardrail_window_days?: number;
}

export interface CampaignStartParams {
  /** Launch past the bounce-risk gate. */
  acknowledge_list_risk?: boolean;
}

export interface CampaignStartResult {
  status: 'started' | (string & {});
  /** True when the campaign is active with nothing to send yet. */
  waiting_for_leads: boolean;
}

export interface CampaignStopResult {
  status: 'stopped' | (string & {});
}

export interface CampaignDuplicateParams {
  name?: string;
}

export interface CampaignsOverview {
  total: number;
  active: number;
  /** Sum of every `paused_*` status. */
  paused: number;
  draft: number;
  completed: number;
  folders: { folder_id: string; total: number }[];
}

// ---------------------------------------------------------------- steps

export interface Step {
  id: string;
  name: string;
  subject: string;
  body_plain: string;
  body_html: string;
  body_sync: boolean;
  body_code: boolean;
  wait_after: number;
  position: number;
  thread_reply: boolean;
  x: number;
  y: number;
  /** Routing. `{}` ends the flow at this step. Schema not fixed by the spec. */
  conditions?: JsonObject;
  kind: 'email' | 'action' | 'wait' | (string & {});
  action?: JsonObject;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

export interface StepUpdateParams extends StepInput {
  /** Passed through as given. */
  conditions?: JsonObject;
  kind?: 'email' | 'action' | 'wait' | (string & {});
  /** Passed through as given. */
  action?: JsonObject;
}

// ---------------------------------------------------------------- leads

export interface LeadHold {
  since: DateTimeString;
  until?: DateTimeString;
  reason?: string;
  source: 'out_of_office' | 'manual' | (string & {});
}

export interface LeadHoldState {
  campaign_id: string;
  contact_id: string;
  hold?: LeadHold;
}

export interface LeadPauseParams {
  /** Omit for a hold only a resume lifts. */
  until?: DateTimeInput;
  reason?: string;
}

export interface ContactCampaignProgress {
  status: string;
  sent: number;
  opened: number;
  machine_opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  last_activity_at?: DateTimeString;
  current_step?: string;
  failure_reason?: string;
  sender?: string;
  hold?: LeadHold;
  cc?: unknown[];
}

// ---------------------------------------------------------------- contacts

export interface Label {
  id: string;
  title: string;
  color: string;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  phone: string;
  custom_fields: Record<string, string>;
  subscribed: boolean;
  campaigns: { id: string; name: string }[];
  categories: Label[];
  verification_status: 'valid' | 'risky' | 'invalid' | 'unknown' | (string & {});
  verification_reason: string;
  is_catch_all: boolean;
  verification_checked_at?: DateTimeString;
  verification_source: string;
  verification_provider: string;
  verification_sub_status: string;
  verification_confidence: number;
  verification_requested_at?: DateTimeString;
  mail_host: string;
  esp_provider: string;
  esp_resolved_at?: DateTimeString;
  consent_given_at?: DateTimeString;
  consent_source?: string;
  /** Fields not fixed by the spec beyond `grade` and `score`. */
  lead_score?: JsonObject;
  /** Present on a search with exactly one campaign id. */
  campaign_lead?: ContactCampaignProgress;
  /** Search rows only. Fields not fixed by the spec. */
  outreach?: JsonObject;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

export interface ContactDetail extends Contact {
  engagement?: JsonObject;
  suppression?: JsonObject;
  verification?: JsonObject;
  source?: string;
  source_detail?: string;
  first_seen_at?: DateTimeString;
  consent_country?: string;
  consent_required?: boolean;
}

export interface CustomFieldFilter {
  name: string;
  value: string;
  type: 'equal' | 'starts_with' | 'ends_with' | 'contains';
}

/** Body of `POST /contacts/search`. Every filter is optional. */
export interface ContactSearchFilters {
  query?: string;
  custom_field_filters?: CustomFieldFilter[];
  /** Contacts in ALL of these campaigns. */
  campaign_ids?: string[];
  /** Needs exactly one campaign id. */
  lead_status?: string;
  /** Needs exactly one campaign id. */
  engagement?: string;
  category_ids?: string[];
  segment_ids?: string[];
  min_campaigns?: number;
  max_campaigns?: number;
  subscribed?: boolean;
  verification_status?: string;
  mail_hosts?: string[];
  lead_grades?: ('A' | 'B' | 'C' | 'D' | 'unscored')[];
  created_after?: DateTimeInput;
  created_before?: DateTimeInput;
  updated_after?: DateTimeInput;
  updated_before?: DateTimeInput;
  /** `created_at` (default), `updated_at`, `first_name`, `last_name`, `email`, `company`, `phone`, `campaign_count`, `mail_host`, `lead_score` or `custom:<key>`. */
  sort_by?: string;
  /** Ascending when true. */
  reverse?: boolean;
}

export interface ContactListParams extends ContactSearchFilters, PageParams {
  /** One label uuid (sent in the query string). */
  category?: string;
}

export interface LeadListParams extends Omit<ContactSearchFilters, 'campaign_ids'>, PageParams {}

export interface ContactsPage extends ListResponse<Contact> {
  /** First page only. */
  counts?: JsonObject;
  /** First page only, with one campaign id. */
  lead_counts?: JsonObject;
}

export interface ContactInput {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  campaigns?: string[];
  categories?: string[];
  segments?: string[];
  custom_fields?: Record<string, string>;
  subscribed?: boolean;
  verification_status?: string;
  verification_provider?: string;
}

export interface ContactUpdateParams {
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
  phone?: string;
  /** Replaces the contact's custom fields. */
  custom_fields?: Record<string, string>;
  subscribed?: boolean;
  /** Replaces the contact's campaign list. */
  campaigns?: string[];
  /** Replaces the contact's labels. */
  categories?: string[];
  add_categories?: string[];
  remove_categories?: string[];
}

export interface ContactSelection {
  all: true;
  filters?: ContactSearchFilters;
  exclude?: string[];
}

// ---------------------------------------------------------------- mailboxes

export interface Mailbox {
  id: string;
  user_id: string;
  organization_id?: string;
  worker_id: string | null;
  email: string;
  name: string;
  signature_plain: string;
  signature_html: string;
  send_as_email: string;
  provider: 'gmail' | 'outlook' | 'smtp_imap' | (string & {});
  status: string;
  mail_host: string;
  auth_method: string;
  avatar_url: string;
  last_synced_at: DateTimeString;
  campaign_limit: number;
  /** Seconds. */
  min_wait_time: number;
  reply_to: string;
  tracking_domain: string;
  tracking_domain_verified: boolean;
  auth_state: string;
  auth_spf: boolean;
  auth_dkim: boolean;
  auth_dmarc: boolean;
  auth_checked_at?: DateTimeString;
  /** Set while warmup is on. */
  warmup: DateTimeString | null;
  warmup_paused_at: DateTimeString | null;
  warmup_base: number;
  warmup_max: number;
  warmup_increase: number;
  warmup_reply_rate: number;
  warmup_pool_type: string;
  timezone: string;
  save_to_sent: boolean;
  relay_folder_moves: boolean;
  tags: string[];
  created_at: DateTimeString;
  updated_at: DateTimeString;
  [key: string]: unknown;
}

export interface MailboxListParams extends PageParams {
  q?: string;
  /** Tag uuid. */
  tag?: string;
}

export interface SyncState {
  backfill_status: string;
  backfill_cursor?: unknown;
  backfill_synced: number;
  backfill_since?: DateTimeString;
  backfill_started_at?: DateTimeString;
  backfill_completed_at?: DateTimeString;
  throttled_until?: DateTimeString;
  throttle_reason?: string;
  deferred: number;
  last_synced_at?: DateTimeString;
  [key: string]: unknown;
}

export interface MailboxSync {
  state: SyncState | null;
  policy: {
    backfill_days: number;
    backfill_messages: number;
    daily_messages: number;
    org_daily_messages: number;
    skip_folders?: string[];
  };
  skip_folders: string[];
  folders: { name: string; folder: string }[];
}

// ---------------------------------------------------------------- unibox

export interface MessagePreview {
  id: string;
  /** Mailbox id. */
  email_id: string;
  /** Provider thread string, not a uuid. */
  thread_id: string;
  from_addr: string[];
  to_addr: string[];
  subject: string;
  snippet: string;
  internal_date: DateTimeString;
  seen: boolean;
  message_count: number;
  has_unread: boolean;
  labels: Label[];
  answers_mailbox_id?: string;
  campaign_id?: string;
}

export interface Message {
  id: string;
  gmail_id: string;
  uid: number;
  email_id: string;
  folder: string;
  parent_id: string;
  thread_id: string;
  flags: string[];
  bcc: string[];
  cc: string[];
  date: DateTimeString;
  from: string[];
  in_reply_to: string[];
  message_id: string;
  /** The API capitalises this key. */
  ReplyTo: string[];
  to: string[];
  subject: string;
  size: number;
  internal_date: DateTimeString;
  mod_seq: number;
  body_plain: string;
  /** Sanitized by the server. */
  body_html: string;
  body_truncated: boolean;
}

export interface ThreadListParams extends PageParams {
  from?: string;
  address?: string;
  direction?: 'sent' | 'received';
  folder?: 'inbox' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash';
  include_archived?: boolean;
  subject?: string;
  unseen?: boolean;
  snoozed?: true | 'any';
  awaiting_reply?: boolean;
  agent_drafts?: boolean;
  since?: DateTimeInput;
  until?: DateTimeInput;
  campaign_id?: string;
  contact_id?: string;
  email_id?: string;
  /** Sent comma-separated. */
  email_ids?: string[];
  uncategorized?: boolean;
  automated?: boolean;
  /** Sent comma-separated. */
  category_ids?: string[];
}

export interface ThreadGetParams extends PageParams {
  thread_id: string;
  /** Omit to read across every mailbox. */
  email_id?: string;
}

export interface UnreadCountParams {
  email_id?: string;
}

export interface UnreadCount {
  count: number;
}

export interface ReplyParams {
  /** The sending mailbox. */
  email_account_id: string;
  to: string[];
  subject: string;
  cc?: string[];
  bcc?: string[];
  body_html?: string;
  /** Rendered from `body_html` when empty. */
  body_plain?: string;
  /** Message-IDs. */
  in_reply_to?: string[];
  thread_id?: string;
  send_mode?: 'instant' | 'smart' | 'scheduled';
  /** Implies `scheduled`. */
  scheduled_at?: DateTimeInput;
  /** Makes it a forward. */
  forward_message_id?: string;
}

export interface SendResult {
  task_id: string;
  scheduled_at: DateTimeString;
  send_mode: string;
}

export interface Draft {
  id: string;
  email_account_id?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  body_html: string;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

export interface DraftSaveParams {
  email_account_id?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  /** Plain text, up to 100,000 characters. */
  body?: string;
  body_html?: string;
}

export interface AgentDraft {
  id: string;
  organization_id: string;
  email_account_id: string;
  owner_user_id: string;
  thread_id: string;
  source_message_id?: string;
  contact_id?: string;
  campaign_id?: string;
  to_addr: string;
  subject: string;
  in_reply_to: string;
  body: string;
  intent_class: string;
  confidence: number;
  model: string;
  status: string;
  /** Has `flags`; other fields not fixed by the spec. */
  grounding?: { flags?: unknown[]; [key: string]: unknown };
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

export interface AgentDraftApproveParams {
  /** Edited text. */
  body?: string;
  /** Needed when `grounding.flags` is not empty. */
  acknowledge_flags?: boolean;
}

// ---------------------------------------------------------------- templates

export interface Template {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  subject: string;
  body_html: string;
  body_plain: string;
  position: number;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

export interface TemplateCreateParams {
  name: string;
  subject?: string;
  body_html?: string;
  body_plain?: string;
}

export type TemplateUpdateParams = Partial<TemplateCreateParams>;

// ---------------------------------------------------------------- webhooks

export interface WebhookEndpoint {
  id: string;
  organization_id: string;
  url: string;
  description: string;
  /** Empty means every non-firehose event. */
  event_types: string[];
  enabled: boolean;
  last_success_at?: DateTimeString;
  last_failure_at?: DateTimeString;
  last_failure_reason?: string;
  consecutive_failures: number;
  oauth_application_id?: string;
  created_by?: string;
  verified_at?: DateTimeString;
  ownership_confirmed: boolean;
  auto_disabled_at?: DateTimeString;
  disabled_reason?: string;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  /** `whsec_` + 64 hex characters. Shown once. */
  secret: string;
}

export interface EventType {
  type: string;
  category: string;
  description: string;
  firehose: boolean;
  deprecated: boolean;
}

export interface WebhookList {
  endpoints: WebhookEndpoint[];
  event_types: EventType[];
}

export interface WebhookCreateParams {
  /** HTTPS and publicly routable. */
  url: string;
  description?: string;
  event_types?: string[];
  /** Defaults to true. */
  enabled?: boolean;
}

/** Replace semantics: send the full desired state. An omitted `enabled` becomes true. */
export type WebhookUpdateParams = WebhookCreateParams;

export interface WebhookSecret {
  secret: string;
}

export interface WebhookVerifyResult {
  status: 'challenge_sent' | (string & {});
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  organization_id: string;
  event_type: string;
  event_id: string;
  payload: JsonObject;
  status: 'pending' | 'in_flight' | 'delivered' | 'failed' | 'abandoned' | (string & {});
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: DateTimeString;
  last_attempt_at?: DateTimeString;
  response_status?: number;
  response_body_excerpt?: string;
  error_reason?: string;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

export interface DeliveryListParams extends PageParams {
  status?: 'pending' | 'in_flight' | 'delivered' | 'failed' | 'abandoned';
  event_type?: string;
  endpoint_id?: string;
}

/** The JSON body of a webhook delivery. */
export interface WebhookEvent<D = JsonObject> {
  /** Equals the `X-Ayinbox-Event-Id` header; use it to dedupe. */
  id: string;
  event_type: string;
  organization_id: string;
  created_at: DateTimeString;
  data: D;
}

// ---------------------------------------------------------------- analytics

export interface AnalyticsDashboardParams {
  period?: '7d' | '30d' | '90d';
  /** Sent comma-separated. */
  campaign_ids?: string[];
  /** Sent comma-separated. */
  folder_ids?: string[];
}

export interface AnalyticsDashboard {
  period: string;
  overall_stats: {
    total_emails_sent: number;
    total_opens: number;
    machine_opens: number;
    total_clicks: number;
    machine_clicks: number;
    total_replies: number;
    total_bounces: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;
    active_campaigns: number;
    active_accounts: number;
    [key: string]: unknown;
  };
  recent_activity: JsonObject[];
  top_campaigns: JsonObject[];
  account_health: JsonObject;
  daily_trend: JsonObject[];
  capacity_today?: JsonObject;
  scope?: JsonObject;
  [key: string]: unknown;
}

export interface DateRangeParams {
  /** Day range start, for example `2026-11-01`. */
  from?: string;
  to?: string;
}

export interface CampaignAnalytics {
  campaign_id: string;
  name: string;
  status: string;
  date_range: { from: DateTimeString; to: DateTimeString };
  summary: {
    total_contacts: number;
    emails_sent: number;
    emails_pending: number;
    unique_opens: number;
    machine_opens: number;
    unique_clicks: number;
    machine_clicks: number;
    replies: number;
    positive_replies: number;
    interested_leads: number;
    bounces: number;
    unsubscribes: number;
    [key: string]: unknown;
  };
  steps: JsonObject[];
  daily_stats?: JsonObject[];
  engagement?: {
    countries?: EngagementRow[];
    clients?: EngagementRow[];
    devices?: EngagementRow[];
    surfaces?: EngagementRow[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EngagementRow {
  key: string;
  opens: number;
  clicks: number;
}

export interface AccountAnalyticsListParams extends PageParams {
  /** Up to 200 mailbox uuids, sent comma-separated. */
  email_ids?: string[];
}

// ---------------------------------------------------------------- suppressions

export interface Suppression {
  id: string;
  organization_id: string;
  /** An address or a domain. */
  email: string;
  kind: 'email' | 'domain' | (string & {});
  reason: string;
  source: string;
  campaign_id?: string;
  expires_at?: DateTimeString;
  metadata?: JsonObject;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

export interface SuppressionListParams extends PageParams {
  q?: string;
}

export interface SuppressionAddParams {
  entries: { value: string; reason?: string }[];
  reason?: string;
}

export interface SuppressionAddResult {
  added: number;
  skipped: string[];
}

// ---------------------------------------------------------------- ai tools

export type AiToolsetName =
  | 'inbox'
  | 'campaigns'
  | 'contacts'
  | 'leads'
  | 'crm'
  | 'mailboxes'
  | 'workspace'
  | 'automation'
  | 'forms'
  | 'developer'
  | 'research'
  | 'analytics';

export interface AiToolListParams {
  format?: 'ayinbox' | 'openai' | 'hermes' | 'functions';
  /** Sent comma-separated. */
  toolsets?: AiToolsetName[];
}

export interface AiTool {
  name: string;
  description: string;
  input_schema: JsonObject;
}

export interface AiFunctionTool {
  type: 'function';
  function: { name: string; description: string; parameters: JsonObject };
}

export interface AiToolCallResult {
  data: {
    name: string;
    /** Parsed JSON when the tool returned JSON, else a string. */
    result: unknown;
    result_text: string;
    /** True when the result holds text from people outside the workspace: fence it as data before a model reads it. */
    untrusted: boolean;
  };
}
