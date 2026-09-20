import { describe, expect, it } from "vitest"

import {
  ApiKeyRejectedError,
  errorCode,
  NoDataError,
  PaperNotFoundError,
  RateLimitedError,
  StorageFullError,
  UnavailableError
} from "~lib/errors"

describe("errorCode", () => {
  it("gives every known failure its own code", () => {
    expect(errorCode(new RateLimitedError())).toBe("rate_limited")
    expect(errorCode(new PaperNotFoundError())).toBe("not_found")
    expect(errorCode(new ApiKeyRejectedError())).toBe("key_rejected")
    expect(errorCode(new StorageFullError())).toBe("storage_full")
    expect(errorCode(new UnavailableError())).toBe("unavailable")
    expect(errorCode(new NoDataError())).toBe("no_data")
  })

  it("falls back to unknown for anything else, whatever it is", () => {
    expect(errorCode(new Error("boom"))).toBe("unknown")
    expect(errorCode("text")).toBe("unknown")
    expect(errorCode(null)).toBe("unknown")
    expect(errorCode(undefined)).toBe("unknown")
  })

  it("keeps developer messages in English, never a user-facing language", () => {
    for (const error of [
      new RateLimitedError(),
      new ApiKeyRejectedError(),
      new PaperNotFoundError(),
      new UnavailableError(),
      new StorageFullError(),
      new NoDataError()
    ]) {
      expect(error.message).toMatch(/^[ -~]+$/)
    }
  })
})
