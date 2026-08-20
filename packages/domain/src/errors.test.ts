// @vitest-environment node

import { describe, expect, it } from "vitest";

import { CoreOperationError, sanitizeOperationError } from "./errors.js";

describe("operation error privacy", () => {
  it("allows only reviewed safe details across the public Core boundary", () => {
    const error = sanitizeOperationError({
      code: "TARGET_MISMATCH",
      reason: "POST_WRITE_TARGET_VERIFICATION_FAILED",
      details: {
        expectedTargetId: "fixture.tx.alpha-2g4",
        observedTargetId: "fixture.rx.beta-subghz",
        deviceId: "serial-1234",
        accessToken: "secret-token",
      },
      retryable: false,
    });

    expect(error.details).toEqual({
      expectedTargetId: "fixture.tx.alpha-2g4",
      observedTargetId: "fixture.rx.beta-subghz",
    });
    expect(JSON.stringify(error)).not.toContain("serial-1234");
    expect(JSON.stringify(error)).not.toContain("secret-token");
  });

  it("fails closed when a provider returns a free-form reason", () => {
    const error = new CoreOperationError({
      code: "CONNECTION_LOST",
      reason: "device said: password=hunter2",
      details: {},
      retryable: true,
    });

    expect(error.operationError).toEqual({
      code: "INTERNAL_ERROR",
      reason: "UNSAFE_PROVIDER_ERROR_REJECTED",
      details: {},
      retryable: false,
    });
    expect(error.message).not.toContain("hunter2");
  });

  it("fails closed on malformed runtime code, details, or retryability", () => {
    for (const malformed of [
      {
        code: "ADAPTER_SECRET_CODE",
        reason: "SAFE_REASON",
        details: {},
        retryable: true,
      },
      {
        code: "CONNECTION_LOST",
        reason: "SAFE_REASON",
        details: null,
        retryable: true,
      },
      {
        code: "CONNECTION_LOST",
        reason: "SAFE_REASON",
        details: {},
        retryable: "yes",
      },
    ]) {
      expect(sanitizeOperationError(malformed as never)).toEqual({
        code: "INTERNAL_ERROR",
        reason: "UNSAFE_PROVIDER_ERROR_REJECTED",
        details: {},
        retryable: false,
      });
    }
  });
});
