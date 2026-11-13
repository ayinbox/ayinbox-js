/** Root of every error this SDK throws. */
export class AyInboxError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Fields carried by every error the API answered. */
export interface APIErrorInit {
  status: number;
  code: string;
  message: string;
  reason?: string | undefined;
  requestId?: string | undefined;
  body: unknown;
  headers: Headers;
  retryAfter?: number | undefined;
}

/** The API answered with a non-2xx status. Branch on `status` and `code`, never on `message`. */
export class APIError extends AyInboxError {
  /** HTTP status. */
  readonly status: number;
  /** Stable machine-readable key, for example `not_found` or `api_key_holder_left`. */
  readonly code: string;
  /** Finer key on a few codes; treat a missing or unknown value as the plain `code`. */
  readonly reason: string | undefined;
  /** Request id from the body or the `X-Request-Id` header. */
  readonly requestId: string | undefined;
  /** Parsed JSON body, or the raw text when the body was not JSON. */
  readonly body: unknown;
  /** Response headers. */
  readonly headers: Headers;
  /** Seconds to wait before retrying, when the server said so. */
  readonly retryAfter: number | undefined;

  constructor(init: APIErrorInit) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.reason = init.reason;
    this.requestId = init.requestId;
    this.body = init.body;
    this.headers = init.headers;
    this.retryAfter = init.retryAfter;
  }
}

/** 400 or 422: the request was refused as invalid. */
export class ValidationError extends APIError {}
/** 400 Bad Request. */
export class BadRequestError extends ValidationError {}
/** 422 Unprocessable. */
export class UnprocessableEntityError extends ValidationError {}
/** 401: the credential is missing, wrong, revoked, or its holder left the workspace. */
export class AuthenticationError extends APIError {}
/** 402: the workspace is out of credits or not entitled to the feature. */
export class PaymentRequiredError extends APIError {}
/** 403: the credential lacks a scope or the action is not allowed. */
export class PermissionDeniedError extends APIError {}
/** 404 Not Found. */
export class NotFoundError extends APIError {}
/** 409 Conflict, including idempotency conflicts. */
export class ConflictError extends APIError {}
/** 429 Too Many Requests. `retryAfter` holds the wait in seconds when known. */
export class RateLimitError extends APIError {}
/** Any 5xx. */
export class ServerError extends APIError {}
/** 500, 501, 502, 504 and other 5xx except 503. */
export class InternalServerError extends ServerError {}
/** 503 Service Unavailable. */
export class ServiceUnavailableError extends ServerError {}

/** The request did not get an HTTP answer (DNS, TLS, connection reset, aborted). */
export class ConnectionError extends AyInboxError {}
/** The request took longer than the configured timeout. */
export class TimeoutError extends ConnectionError {}
/** A webhook payload failed signature verification. */
export class SignatureVerificationError extends AyInboxError {}

const DEFAULT_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  402: 'insufficient_credits',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'unprocessable',
  429: 'rate_limit_exceeded',
  500: 'internal_error',
  501: 'not_implemented',
  503: 'service_unavailable',
};

function defaultCode(status: number): string {
  return DEFAULT_CODES[status] ?? (status >= 500 ? 'internal_error' : 'api_error');
}

const CODE_SHAPE = /^[a-z0-9_]+$/;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** Parses a `Retry-After` value (seconds or HTTP date) into seconds. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, n);
  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, (at - now) / 1000);
}

/** Builds the typed error for a non-2xx response. */
export function errorFromResponse(status: number, headers: Headers, body: unknown): APIError {
  const obj = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  const errField = str(obj?.['error']);
  const code = str(obj?.['code']) ?? (errField && CODE_SHAPE.test(errField) ? errField : defaultCode(status));
  const message =
    str(obj?.['message']) ?? errField ?? (typeof body === 'string' && body !== '' ? body : `HTTP ${status}`);
  const requestId = str(obj?.['request_id']) ?? headers.get('x-request-id') ?? undefined;

  let retryAfter = parseRetryAfter(headers.get('retry-after'));
  if (retryAfter === undefined && typeof obj?.['retry_after'] === 'number') retryAfter = obj['retry_after'];
  if (retryAfter === undefined && typeof obj?.['retry_after_ms'] === 'number') {
    retryAfter = Math.ceil(obj['retry_after_ms'] / 1000);
  }

  const init: APIErrorInit = { status, code, message, reason: str(obj?.['reason']), requestId, body, headers, retryAfter };
  switch (status) {
    case 400:
      return new BadRequestError(init);
    case 401:
      return new AuthenticationError(init);
    case 402:
      return new PaymentRequiredError(init);
    case 403:
      return new PermissionDeniedError(init);
    case 404:
      return new NotFoundError(init);
    case 409:
      return new ConflictError(init);
    case 422:
      return new UnprocessableEntityError(init);
    case 429:
      return new RateLimitError(init);
    case 503:
      return new ServiceUnavailableError(init);
    default:
      if (status >= 500) return new InternalServerError(init);
      return new APIError(init);
  }
}
