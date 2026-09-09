import { CoreOperationError } from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import {
  isAbortError,
  readProviderDataProperty,
  safeOperationError,
} from "./sensitive-operation-helpers.js";

describe("sensitive provider error boundary", () => {
  it("preserves stable classification but removes provider-owned diagnostics", () => {
    const secret = "binding_phrase_S3CRET_ABC123";
    const secretReason = "BINDING_PHRASE_SECRET_ABC123";
    const result = safeOperationError(
      new CoreOperationError({
        code: "CONNECTION_LOST",
        reason: secretReason,
        details: {
          targetId: secret,
          providerId: "credential_shaped_but_valid_token",
        },
        retryable: true,
      }),
      "FALLBACK",
    );

    expect(result).toEqual({
      code: "CONNECTION_LOST",
      reason: "FALLBACK",
      details: {},
      retryable: true,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(secretReason);
    expect(JSON.stringify(result)).not.toContain("credential_shaped");
  });

  it("does not execute accessors on a mutated Core error", () => {
    const error = new CoreOperationError({
      code: "CONNECTION_LOST",
      reason: "ORIGINAL_SAFE_REASON",
      details: {},
      retryable: true,
    });
    let getterCalls = 0;
    Object.defineProperty(error, "operationError", {
      configurable: true,
      get() {
        getterCalls += 1;
        throw new Error("BINDING_PHRASE_SECRET_ABC123");
      },
    });

    expect(safeOperationError(error, "FALLBACK")).toEqual({
      code: "INTERNAL_ERROR",
      reason: "FALLBACK",
      details: {},
      retryable: true,
    });
    expect(getterCalls).toBe(0);
  });

  it("recognizes only an own data abort marker without executing a getter", () => {
    let getterCalls = 0;
    const hostile = Object.defineProperty({}, "name", {
      get() {
        getterCalls += 1;
        throw new Error("WIFI_PASSWORD_SECRET_ABC123");
      },
    });
    const cancelled = new Error("cancelled");
    cancelled.name = "AbortError";

    expect(isAbortError(hostile)).toBe(false);
    expect(isAbortError(cancelled)).toBe(true);
    expect(getterCalls).toBe(0);
  });

  it("fails closed when a Proxy blocks own-property inspection", () => {
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("PRIVATE_PROXY_DIAGNOSTIC");
        },
      },
    );

    expect(readProviderDataProperty(hostile, "id")).toBeUndefined();
  });
});
