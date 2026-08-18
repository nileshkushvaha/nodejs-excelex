/**
 * The API's error contract, as the web app reads it.
 *
 * Client-safe on purpose — no next/headers, no server-only imports — because
 * a failed response has to be read in three places that cannot share a
 * module otherwise: server components and actions (through api.ts), the
 * sign-in form and the import dialog (browser fetch), and the error
 * boundaries (which see only what survives serialisation).
 *
 * The shape is the one the API's exception filter writes for every failure:
 *
 *   { statusCode, code, message, reference, requestId, errors?, details? }
 *
 * `code` is what a screen switches on; `message` is what it shows; `errors`
 * places a sentence next to a field; `reference` is what a person quotes to
 * support, and it is the same id as the API's log line.
 */
export interface ApiFieldError {
  path: string;
  message: string;
  code?: string;
}

export interface ApiErrorBody {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  reference?: string;
  requestId?: string;
  errors?: ApiFieldError[];
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reference: string | null;
  readonly messages: string[];
  readonly errors: ApiFieldError[];
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, body: ApiErrorBody | null, fallback?: string) {
    const messages = normaliseMessages(body?.message);
    super(messages[0] ?? fallback ?? defaultMessage(status));
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code ?? codeForStatus(status);
    this.reference = body?.reference ?? body?.requestId ?? null;
    this.messages = messages.length ? messages : [this.message];
    this.errors = Array.isArray(body?.errors) ? body.errors : [];
    this.details = body?.details;
  }

  /** 401: the session is gone. The right response is the sign-in page. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** 403 / 404: signed in, but this is not for you. */
  get isNotAllowed(): boolean {
    return this.status === 403 || this.status === 404;
  }

  /** 5xx or no answer at all: nothing the reader did; try again shortly. */
  get isUnavailable(): boolean {
    return this.status >= 500 || this.status === 0;
  }

  /** `errors` as a path → first message map, which is what a form wants. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const error of this.errors) if (!(error.path in out)) out[error.path] = error.message;
    return out;
  }
}

/**
 * The API, or the network between us and it, did not answer.
 *
 * Thrown (not returned) by the server-side reads, so an outage stops a page
 * at the error boundary with an honest screen, instead of every page
 * rendering "you do not hold the permission" because it saw null. Status 0
 * means the fetch itself failed — connection refused, DNS, timeout.
 *
 * `digest` is set here because it is the one property Next carries from a
 * server component to the client error boundary in production; everything
 * else about the error is replaced with a generic message. The boundary
 * decodes it back into a status and a reference to show.
 */
export class ApiUnavailableError extends ApiError {
  readonly digest: string;

  constructor(status: number, body: ApiErrorBody | null, path: string) {
    super(status, body, status === 0 ? "The API did not answer." : undefined);
    this.name = "ApiUnavailableError";
    this.digest = encodeDigest({ status: this.status, code: this.code, reference: this.reference });
    // Kept for the server log; never reaches the browser in production.
    this.message = `${this.message} (${status || "network"} ${path})`;
  }
}

// ── Reading a failed Response ────────────────────────────────────────────────

/** Reads a non-OK Response into an ApiError, tolerating an empty or HTML body. */
export async function readApiError(response: Response): Promise<ApiError> {
  const body = await readErrorBody(response);
  return new ApiError(response.status, body);
}

export async function readErrorBody(response: Response): Promise<ApiErrorBody | null> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json")) return null;
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return null;
  }
}

/** The fetch threw — the API is unreachable. */
export function networkFailure(path: string): ApiUnavailableError {
  return new ApiUnavailableError(0, null, path);
}

// ── What a person should read ────────────────────────────────────────────────

const OFFLINE_MESSAGE = "We could not reach the server. Nothing was changed — try again in a moment.";

function defaultMessage(status: number): string {
  if (status === 0) return OFFLINE_MESSAGE;
  if (status === 401) return "You are signed out. Sign in again to continue.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "That could not be found.";
  if (status === 409) return "That conflicts with a change somebody else made. Reload and try again.";
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. The error has been recorded.";
  return `Request failed (${status}).`;
}

function codeForStatus(status: number): string {
  if (status === 0) return "network_unreachable";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status >= 500) return "service_unavailable";
  return `http_${status}`;
}

function normaliseMessages(message: string | string[] | undefined): string[] {
  if (Array.isArray(message)) return message.filter((entry) => typeof entry === "string" && entry.length > 0);
  return typeof message === "string" && message.length > 0 ? [message] : [];
}

// ── The digest channel to error boundaries ───────────────────────────────────

const DIGEST_PREFIX = "excelex.api";

export interface DecodedDigest {
  status: number;
  code: string;
  reference: string | null;
}

export function encodeDigest(input: DecodedDigest): string {
  return [DIGEST_PREFIX, input.status, input.code, input.reference ?? ""].join(";");
}

/** Null when the digest is Next's own hash rather than one of ours. */
export function decodeDigest(digest: string | undefined): DecodedDigest | null {
  if (!digest || !digest.startsWith(`${DIGEST_PREFIX};`)) return null;
  const [, status, code, reference] = digest.split(";");
  const parsed = Number(status);
  if (!Number.isFinite(parsed)) return null;
  return { status: parsed, code: code ?? "unknown", reference: reference ? reference : null };
}
