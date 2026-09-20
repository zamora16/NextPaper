// Failures the user can be told about. Messages here are for developers (logs,
// tests); what the user reads is chosen from the error CODE at render time, in
// their language (see lib/i18n). Codes, not translated text, are what gets
// stored in the job state and the alerts state, so switching language never
// leaves a message in the wrong one.

export type ErrorCode =
  | "rate_limited" // Semantic Scholar is throttling requests
  | "not_found" // the paper is not indexed
  | "key_rejected" // Semantic Scholar refused the user's API key (403)
  | "storage_full" // the browser storage quota is exhausted
  | "unavailable" // Semantic Scholar answered with an unexpected error
  | "no_data" // a lookup that must return data came back empty
  | "unknown"

export class RateLimitedError extends Error {
  constructor() {
    super("Semantic Scholar is rate limiting requests.")
  }
}

// A 403 means Semantic Scholar refused the key (revoked, or mistyped in a way
// the format check cannot see). Retrying cannot fix it.
export class ApiKeyRejectedError extends Error {
  constructor() {
    super("Semantic Scholar rejected the API key (403).")
  }
}

export class PaperNotFoundError extends Error {
  constructor() {
    super("The paper is not indexed in Semantic Scholar.")
  }
}

export class UnavailableError extends Error {
  constructor() {
    super("Semantic Scholar could not be reached.")
  }
}

export class StorageFullError extends Error {
  constructor() {
    super("Not enough extension storage left.")
  }
}

export class NoDataError extends Error {
  constructor() {
    super("The lookup returned no data.")
  }
}

export function errorCode(error: unknown): ErrorCode {
  if (error instanceof RateLimitedError) return "rate_limited"
  if (error instanceof PaperNotFoundError) return "not_found"
  if (error instanceof ApiKeyRejectedError) return "key_rejected"
  if (error instanceof StorageFullError) return "storage_full"
  if (error instanceof UnavailableError) return "unavailable"
  if (error instanceof NoDataError) return "no_data"
  return "unknown"
}
