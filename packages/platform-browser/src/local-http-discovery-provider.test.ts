import {
  rebuildDiscoveryEvidence,
  resolveDeviceIdentity,
} from "@elrs-easy/device";
import {
  CoreOperationError,
  identityClaims,
  identityResolutionReasons,
} from "@elrs-easy/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExpressLrsLocalHttpDiscoveryProvider,
  createExpressLrsLocalHttpEvidencePolicy,
  expressLrsLocalHttpCapabilityAssessment,
  expressLrsLocalHttpOrigins,
  type BrowserFetch,
  type ExpressLrsLocalHttpOrigin,
} from "./local-http-discovery-provider.js";

const observedAt = new Date("2026-08-20T12:00:00.000Z");

afterEach(async () => {
  // Successful cancellation may release the per-origin quarantine in the next
  // task after the original adapter error has already reached the caller.
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
});

const completePayload = {
  settings: {
    product_name: "Reference Receiver",
    lua_name: "PRIVATE LUA NAME",
    uidtype: "Bound",
    ssid: "PRIVATE_WIFI",
    product_serial: "PRIVATE_SERIAL",
    target: "vendor.rx_2400.test",
    version: "4.1.0",
    "git-commit": "a9d4a9c",
    "module-type": "RX",
    "radio-type": "LR1121",
    has_low_band: true,
    has_high_band: true,
    reg_domain_low: 4,
    reg_domain_high: "ISM_2400",
    custom_hardware: false,
  },
  config: {
    uid: [1, 2, 3, 4, 5, 6],
    binding_phrase: "PRIVATE_BINDING_PHRASE",
    wifi_password: "PRIVATE_PASSWORD",
  },
  options: {
    uid: [6, 5, 4, 3, 2, 1],
    ssid: "PRIVATE_OPTIONS_SSID",
  },
};

function jsonResponse(
  payload: unknown = completePayload,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(payload), {
    ...init,
    status: init.status ?? 200,
    headers,
  });
}

function lockedResponse(contentType = "application/json") {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    pull: async () => new Promise<never>(() => undefined),
  });
  const response = new Response(stream, {
    status: 200,
    headers: { "content-type": contentType },
  });
  const body = response.body!;
  const reader = body.getReader();
  const pendingRead = reader.read();
  const cancel = vi.spyOn(body, "cancel");
  return {
    response,
    cancel,
    async releaseExternalReader() {
      controller.error(new Error("TEST_EXTERNAL_READER_RELEASED"));
      await pendingRead.catch(() => undefined);
      reader.releaseLock();
    },
  };
}

function provider(
  input: {
    readonly origin?: ExpressLrsLocalHttpOrigin;
    readonly fetch?: BrowserFetch;
    readonly timeoutMs?: number;
    readonly createDeviceId?: () => string;
    readonly now?: () => Date;
  } = {},
): ExpressLrsLocalHttpDiscoveryProvider {
  return new ExpressLrsLocalHttpDiscoveryProvider({
    origin: input.origin ?? "http://10.0.0.1",
    fetch: input.fetch ?? (async () => jsonResponse()),
    timeoutMs: input.timeoutMs ?? 1_000,
    now: input.now ?? (() => observedAt),
    createDeviceId: input.createDeviceId ?? (() => "ephemeral-test-device"),
  });
}

function session(deviceId: string) {
  return Object.freeze({
    id: "session-test",
    deviceId,
    owner: Object.freeze({ id: "operation-test", kind: "WORKFLOW" as const }),
    acquiredAt: observedAt.toISOString(),
  });
}

async function expectCoreError(
  promise: Promise<unknown>,
  code: string,
  reason: string,
): Promise<CoreOperationError> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(CoreOperationError);
    const coreError = error as CoreOperationError;
    expect(coreError.operationError).toEqual({
      code,
      reason,
      details: {},
      retryable:
        code === "CONNECTION_LOST" ||
        (code === "DEVICE_BUSY" &&
          (reason === "LOCAL_HTTP_DISCOVERY_ALREADY_RUNNING" ||
            reason === "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE")),
    });
    return coreError;
  }
  throw new Error("Expected a CoreOperationError");
}

describe("ExpressLrsLocalHttpDiscoveryProvider", () => {
  it.each(expressLrsLocalHttpOrigins)(
    "uses only the exact normal /config route for %s",
    async (origin) => {
      const fetch = vi.fn<BrowserFetch>(async () => jsonResponse());
      const adapter = provider({ origin, fetch });

      const first = await adapter.discover();
      const second = await adapter.discover();

      expect(fetch).toHaveBeenCalledTimes(1);
      const call = fetch.mock.calls[0];
      expect(call?.[0]).toBe(`${origin}/config`);
      expect(call?.[0]).not.toContain("?");
      const init = call?.[1];
      expect(Object.keys(init ?? {}).sort()).toEqual(
        [
          "cache",
          "credentials",
          "headers",
          "method",
          "mode",
          "redirect",
          "referrerPolicy",
          "signal",
        ].sort(),
      );
      expect(init).toMatchObject({
        method: "GET",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: { Accept: "application/json" },
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(second).toEqual(first);
      expect(second[0]).toBe(first[0]);
    },
  );

  it.each([
    "https://10.0.0.1",
    "http://10.0.0.1/",
    "http://10.0.0.1?route=/config",
    "http://10.0.0.1:80",
    "http://ELRS_RX.local",
    "http://example.local",
    "http://user@10.0.0.1",
  ])("rejects unsupported origin without echoing it: %s", (origin) => {
    expect(
      () =>
        new ExpressLrsLocalHttpDiscoveryProvider({
          origin,
          fetch: async () => jsonResponse(),
        }),
    ).toThrowError(
      expect.objectContaining({
        operationError: {
          code: "PROVIDER_UNSUPPORTED",
          reason: "LOCAL_HTTP_ORIGIN_UNSUPPORTED",
          details: {},
          retryable: false,
        },
      }),
    );
  });

  it("accepts an actual Response and maps only allowlisted facts", async () => {
    const adapter = provider();
    const descriptors = await adapter.discover();
    const descriptor = descriptors[0]!;
    const evidence = await adapter.readIdentity(session(descriptor.id));
    const capabilities = await adapter.readCapabilities(session(descriptor.id));

    expect(descriptor).toEqual({
      id: "ephemeral-test-device",
      transport: "LOCAL_HTTP",
      connectionState: "CONNECTED",
      displayHint: "Reference Receiver",
    });
    expect(
      Object.fromEntries(evidence.map((item) => [item.claim, item.rawValue])),
    ).toEqual({
      [identityClaims.product]: "Reference Receiver",
      [identityClaims.target]: "vendor.rx_2400.test",
      [identityClaims.firmwareVersion]: "4.1.0",
      [identityClaims.firmwareCommit]: "a9d4a9c",
      [identityClaims.deviceRole]: "RX",
      [identityClaims.radioFamily]: "LR1121",
      [identityClaims.frequencyBand]: "DUAL_BAND",
      [identityClaims.regulatoryDomainLow]: "4",
      [identityClaims.regulatoryDomainHigh]: "ISM_2400",
      [identityClaims.customHardwarePresent]: "false",
    });
    expect(evidence.every((item) => item.reliability === "UNVALIDATED")).toBe(
      true,
    );
    expect(capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "read-local-http-config",
          available: true,
        }),
        expect.objectContaining({ id: "radio-low-band", available: true }),
        expect.objectContaining({ id: "radio-high-band", available: true }),
        expect.objectContaining({ id: "custom-hardware", available: false }),
      ]),
    );

    const publicSnapshot = JSON.stringify({
      descriptors,
      evidence,
      capabilities,
    });
    for (const secret of [
      "PRIVATE LUA NAME",
      "PRIVATE_WIFI",
      "PRIVATE_SERIAL",
      "PRIVATE_BINDING_PHRASE",
      "PRIVATE_PASSWORD",
      "PRIVATE_OPTIONS_SSID",
      "1,2,3,4,5,6",
    ]) {
      expect(publicSnapshot).not.toContain(secret);
    }
    expect(publicSnapshot).not.toContain("lua_name");
    expect(publicSnapshot).not.toContain("ssid");
    expect(publicSnapshot).not.toContain("uid");
  });

  it("accepts a bounded future radio family without a model table", async () => {
    const adapter = provider({
      fetch: async () =>
        jsonResponse({
          settings: {
            target: "future.rx.test",
            version: "5.0.0",
            "module-type": "RX",
            "radio-type": "LR2021",
          },
          config: {},
        }),
    });
    const descriptor = (await adapter.discover())[0]!;
    const evidence = await adapter.readIdentity(session(descriptor.id));

    expect(
      evidence.find((item) => item.claim === identityClaims.radioFamily)
        ?.rawValue,
    ).toBe("LR2021");
  });

  it.each([
    [{ has_low_band: true }, undefined, []],
    [{ has_high_band: true }, undefined, []],
    [{ has_low_band: false }, undefined, []],
    [{ has_high_band: false }, undefined, []],
    [{ has_low_band: false, has_high_band: false }, undefined, []],
  ] as const)(
    "handles partial or negative band flags without unsupported empty provenance %#",
    async (flags, expectedBand, expectedCapabilities) => {
      const adapter = provider({
        fetch: async () =>
          jsonResponse({
            settings: {
              target: "partial-band.rx.test",
              version: "4.1.0",
              "module-type": "RX",
              ...flags,
            },
            config: {},
          }),
      });
      const descriptor = (await adapter.discover())[0]!;
      const evidence = await adapter.readIdentity(session(descriptor.id));
      const capabilities = await adapter.readCapabilities(
        session(descriptor.id),
      );

      expect(
        evidence.find((item) => item.claim === identityClaims.frequencyBand)
          ?.rawValue,
      ).toBe(expectedBand);
      expect(
        capabilities
          .filter((item) => item.id.startsWith("radio-"))
          .map((item) => item.id),
      ).toEqual(expectedCapabilities);
      expect(
        capabilities.every((item) => item.sourceEvidenceIds.length > 0),
      ).toBe(true);
    },
  );

  it.each([
    ["TX", true, false, "LOW_BAND", true],
    ["RX", false, true, "HIGH_BAND", false],
  ] as const)(
    "maps a %s single-band snapshot without model-specific branches",
    async (role, hasLowBand, hasHighBand, expectedBand, customHardware) => {
      const adapter = provider({
        fetch: async () =>
          jsonResponse({
            settings: {
              target: `reference.${role.toLowerCase()}.test`,
              version: "4.1.0",
              "module-type": role,
              has_low_band: hasLowBand,
              has_high_band: hasHighBand,
              custom_hardware: customHardware,
            },
            config: {},
          }),
      });
      const descriptor = (await adapter.discover())[0]!;
      const evidence = await adapter.readIdentity(session(descriptor.id));
      const capabilities = await adapter.readCapabilities(
        session(descriptor.id),
      );

      expect(
        evidence.find((item) => item.claim === identityClaims.deviceRole)
          ?.rawValue,
      ).toBe(role);
      expect(
        evidence.find((item) => item.claim === identityClaims.frequencyBand)
          ?.rawValue,
      ).toBe(expectedBand);
      expect(
        capabilities.find((item) => item.id === "custom-hardware")?.available,
      ).toBe(customHardware);
    },
  );

  it("serializes concurrent provider instances for the same origin", async () => {
    let releaseFetch!: (response: unknown) => void;
    const heldResponse = new Promise<unknown>((resolve) => {
      releaseFetch = resolve;
    });
    const fetch = vi.fn<BrowserFetch>(async () => heldResponse);
    const first = provider({ fetch });
    const second = provider({ fetch });

    const firstDiscovery = first.discover();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await expectCoreError(
      second.discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
    );
    expect(fetch).toHaveBeenCalledTimes(1);

    const otherOrigin = provider({
      origin: expressLrsLocalHttpOrigins[1],
      fetch: async () => jsonResponse(),
      createDeviceId: () => "other-origin-device",
    });
    await expect(otherOrigin.discover()).resolves.toHaveLength(1);

    releaseFetch(jsonResponse());
    await expect(firstDiscovery).resolves.toHaveLength(1);

    const afterRelease = provider({ fetch: async () => jsonResponse() });
    await expect(afterRelease.discover()).resolves.toHaveLength(1);
  });

  it("rejects concurrent discovery on the same provider instance", async () => {
    let releaseFetch!: (response: unknown) => void;
    const heldResponse = new Promise<unknown>((resolve) => {
      releaseFetch = resolve;
    });
    const fetch = vi.fn<BrowserFetch>(async () => heldResponse);
    const adapter = provider({ fetch });

    const firstDiscovery = adapter.discover();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await expectCoreError(
      adapter.discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_DISCOVERY_ALREADY_RUNNING",
    );

    releaseFetch(jsonResponse());
    await expect(firstDiscovery).resolves.toHaveLength(1);
  });

  it("ignores unknown fields and permits missing optional fields", async () => {
    const adapter = provider({
      fetch: async () =>
        jsonResponse({
          settings: {
            target: "minimal.rx.test",
            version: "4.1.0",
            "module-type": "RX",
            future_safe_field: { nested: "IGNORED_VALUE" },
          },
          config: { uid: [9, 9, 9, 9, 9, 9] },
          future_top_level: "IGNORED_TOP_LEVEL",
        }),
    });
    const descriptor = (await adapter.discover())[0]!;
    const evidence = await adapter.readIdentity(session(descriptor.id));

    expect(descriptor.displayHint).toBeUndefined();
    expect(evidence.map((item) => item.claim)).toEqual([
      identityClaims.target,
      identityClaims.firmwareVersion,
      identityClaims.deviceRole,
    ]);
    expect(JSON.stringify(evidence)).not.toContain("IGNORED");
    expect(JSON.stringify(evidence)).not.toContain("9,9,9,9,9,9");
  });

  it.each([
    [[], "LOCAL_HTTP_CONFIG_ROOT_INVALID"],
    [{ config: {} }, "LOCAL_HTTP_SETTINGS_OBJECT_INVALID"],
    [{ settings: [], config: {} }, "LOCAL_HTTP_SETTINGS_OBJECT_INVALID"],
    [{ settings: {} }, "LOCAL_HTTP_CONFIG_OBJECT_INVALID"],
    [{ settings: {}, config: [] }, "LOCAL_HTTP_CONFIG_OBJECT_INVALID"],
    [
      { settings: { target: "x", version: "4.1.0" }, config: {} },
      "LOCAL_HTTP_REQUIRED_IDENTITY_MISSING",
    ],
    [
      {
        settings: {
          target: "x",
          version: "4.1.0",
          "module-type": "UNKNOWN",
        },
        config: {},
      },
      "LOCAL_HTTP_MODULE_TYPE_INVALID",
    ],
    [
      {
        settings: {
          target: "x",
          version: "4.1.0",
          "module-type": "RX",
          has_low_band: "true",
        },
        config: {},
      },
      "LOCAL_HTTP_SETTINGS_FIELD_INVALID",
    ],
  ])("rejects malformed normal-route schema %#", async (payload, reason) => {
    const adapter = provider({ fetch: async () => jsonResponse(payload) });
    await expectCoreError(
      adapter.discover(),
      "PROVIDER_UNSUPPORTED",
      reason as string,
    );
  });

  it("rejects malformed JSON without retaining its raw body", async () => {
    const adapter = provider({
      fetch: async () =>
        new Response('{"config":{"uid":"PRIVATE_UID"}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const error = await expectCoreError(
      adapter.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_JSON_INVALID",
    );

    expect(JSON.stringify(error.operationError)).not.toContain("PRIVATE_UID");
    expect(error.message).not.toContain("PRIVATE_UID");
  });

  it("rejects malformed UTF-8 before JSON parsing", async () => {
    const adapter = provider({
      fetch: async () =>
        new Response(new Uint8Array([0xc3, 0x28]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    await expectCoreError(
      adapter.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_BODY_ENCODING_INVALID",
    );
  });

  it.each([
    ["application/json", true],
    ["application/json; charset=utf-8", true],
    ['APPLICATION/JSON; CHARSET="UTF-8"', true],
    ["application/json; totally-invalid-trailing-junk", false],
    ["application/json; charset=iso-8859-1", false],
    ["application/json, text/html", false],
  ] as const)(
    "enforces the strict JSON Content-Type grammar: %s",
    async (contentType, accepted) => {
      const adapter = provider({
        fetch: async () =>
          new Response(JSON.stringify(completePayload), {
            status: 200,
            headers: { "content-type": contentType },
          }),
      });

      if (accepted) {
        await expect(adapter.discover()).resolves.toHaveLength(1);
      } else {
        await expectCoreError(
          adapter.discover(),
          "PROVIDER_UNSUPPORTED",
          "LOCAL_HTTP_CONTENT_TYPE_INVALID",
        );
      }
    },
  );

  it.each([
    [
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_CONTENT_TYPE_INVALID",
    ],
    [
      async () => jsonResponse(completePayload, { status: 503 }),
      "CONNECTION_LOST",
      "LOCAL_HTTP_STATUS_NOT_OK",
    ],
    [
      async () => {
        const body = jsonResponse().body;
        return {
          status: 200,
          redirected: true,
          headers: new Headers({ "content-type": "application/json" }),
          body,
        };
      },
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_REDIRECT_REJECTED",
    ],
  ] as const)(
    "maps response validation failures without raw diagnostics %#",
    async (fetch, code, reason) => {
      const adapter = provider({ fetch });
      await expectCoreError(adapter.discover(), code, reason);
    },
  );

  it.each(["-1", "01", "1.5", "NaN", "9007199254740992"])(
    "rejects malformed Content-Length %s",
    async (contentLength) => {
      const adapter = provider({
        fetch: async () =>
          new Response("{}", {
            status: 200,
            headers: {
              "content-type": "application/json",
              "content-length": contentLength,
            },
          }),
      });

      await expectCoreError(
        adapter.discover(),
        "PROVIDER_UNSUPPORTED",
        "LOCAL_HTTP_CONTENT_LENGTH_INVALID",
      );
    },
  );

  it.each([
    {
      label: "headers",
      reason: "LOCAL_HTTP_HEADERS_INVALID",
      response: {
        status: 200,
        redirected: false,
        headers: null,
        body: null,
      },
    },
    {
      label: "body stream",
      reason: "LOCAL_HTTP_BODY_STREAM_REQUIRED",
      response: {
        status: 200,
        redirected: false,
        headers: new Headers({ "content-type": "application/json" }),
        body: null,
      },
    },
    {
      label: "body reader",
      reason: "LOCAL_HTTP_BODY_READER_INVALID",
      response: {
        status: 200,
        redirected: false,
        headers: new Headers({ "content-type": "application/json" }),
        body: { cancel: async () => undefined, getReader: () => null },
      },
    },
  ])("rejects an invalid $label boundary", async ({ response, reason }) => {
    const adapter = provider({ fetch: async () => response });

    await expectCoreError(adapter.discover(), "PROVIDER_UNSUPPORTED", reason);
  });

  it("cancels and quarantines a rejected response until cleanup settles", async () => {
    let settleCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      settleCleanup = resolve;
    });
    const cancel = vi.fn(async () => cleanup);
    const adapter = provider({
      fetch: async () => ({
        status: 200,
        redirected: false,
        headers: new Headers({ "content-type": "text/html" }),
        body: {
          cancel,
          getReader() {
            throw new Error("REJECTED_BODY_MUST_NOT_BE_READ");
          },
        },
      }),
    });

    await expectCoreError(
      adapter.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_CONTENT_TYPE_INVALID",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    await expectCoreError(
      provider().discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
    );

    settleCleanup();
    await vi.waitFor(async () => {
      await expect(provider().discover()).resolves.toHaveLength(1);
    });
  });

  it("rejects an oversized Content-Length before reading", async () => {
    const adapter = provider({
      fetch: async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(256 * 1024 + 1),
          },
        }),
    });

    await expectCoreError(
      adapter.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_RESPONSE_TOO_LARGE",
    );
  });

  it("enforces the streaming byte limit when Content-Length is absent", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(256 * 1024));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    const adapter = provider({
      fetch: async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    await expectCoreError(
      adapter.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_RESPONSE_TOO_LARGE",
    );
  });

  it.each([
    [new Uint8Array(), "LOCAL_HTTP_BODY_CHUNK_INVALID"],
    ["not-a-byte-view", "LOCAL_HTTP_BODY_CHUNK_INVALID"],
  ] as const)("rejects an invalid streamed chunk %#", async (value, reason) => {
    const adapter = provider({
      fetch: async () => ({
        status: 200,
        redirected: false,
        headers: new Headers({ "content-type": "application/json" }),
        body: {
          getReader() {
            return {
              async read() {
                return { done: false, value };
              },
              async cancel() {},
              releaseLock() {},
            };
          },
        },
      }),
    });

    await expectCoreError(adapter.discover(), "PROVIDER_UNSUPPORTED", reason);
  });

  it("maps a rejected stream read and tracks reader cancellation", async () => {
    const secret = "PRIVATE_STREAM_IMPLEMENTATION_DETAIL";
    const cancel = vi.fn(async () => undefined);
    const adapter = provider({
      fetch: async () => ({
        status: 200,
        redirected: false,
        headers: new Headers({ "content-type": "application/json" }),
        body: {
          getReader() {
            return {
              async read() {
                throw new Error(secret);
              },
              cancel,
              releaseLock() {},
            };
          },
        },
      }),
    });

    const error = await expectCoreError(
      adapter.discover(),
      "CONNECTION_LOST",
      "LOCAL_HTTP_BODY_READ_FAILED",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.operationError)).not.toContain(secret);
  });

  it("bounds streamed chunk count even below the byte limit", async () => {
    let reads = 0;
    const adapter = provider({
      fetch: async () => ({
        status: 200,
        redirected: false,
        headers: new Headers({ "content-type": "application/json" }),
        body: {
          getReader() {
            return {
              async read() {
                reads += 1;
                return { done: false, value: new Uint8Array([0x20]) };
              },
              async cancel() {},
              releaseLock() {},
            };
          },
        },
      }),
      timeoutMs: 1_000,
    });

    await expectCoreError(
      adapter.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_BODY_CHUNK_LIMIT_EXCEEDED",
    );
    expect(reads).toBe(4_097);
  });

  it.each([
    [0, "LOCAL_HTTP_TIMEOUT_INVALID"],
    [60_001, "LOCAL_HTTP_TIMEOUT_INVALID"],
  ] as const)("rejects an invalid timeout %s", (timeoutMs, reason) => {
    expect(() => provider({ timeoutMs })).toThrowError(
      expect.objectContaining({
        operationError: expect.objectContaining({ reason }),
      }),
    );
  });

  it("rejects invalid generated ids and clocks without echoing values", async () => {
    const secret = "PRIVATE_DEVICE_ID_WITH SPACE";
    const invalidId = provider({ createDeviceId: () => secret });
    const idError = await expectCoreError(
      invalidId.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_DEVICE_ID_INVALID",
    );
    expect(JSON.stringify(idError.operationError)).not.toContain(secret);

    const invalidClock = provider({ now: () => new Date(Number.NaN) });
    await expectCoreError(
      invalidClock.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_CLOCK_INVALID",
    );
  });

  it("maps a timeout while fetch is pending to CONNECTION_LOST", async () => {
    let settleFetch!: (response: unknown) => void;
    const pendingFetch = new Promise<unknown>((resolve) => {
      settleFetch = resolve;
    });
    const adapter = provider({
      fetch: async () => pendingFetch,
      timeoutMs: 5,
    });

    await expectCoreError(
      adapter.discover(),
      "CONNECTION_LOST",
      "LOCAL_HTTP_REQUEST_TIMEOUT",
    );
    await expectCoreError(
      provider().discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
    );

    settleFetch(jsonResponse());
    await vi.waitFor(async () => {
      await expect(provider().discover()).resolves.toHaveLength(1);
    });
  });

  it("owns a late response body until its cleanup settles", async () => {
    let settleFetch!: (response: unknown) => void;
    const pendingFetch = new Promise<unknown>((resolve) => {
      settleFetch = resolve;
    });
    let settleCleanup!: () => void;
    const pendingCleanup = new Promise<void>((resolve) => {
      settleCleanup = resolve;
    });
    const cancel = vi.fn(async () => pendingCleanup);
    const adapter = provider({
      fetch: async () => pendingFetch,
      timeoutMs: 5,
    });

    await expectCoreError(
      adapter.discover(),
      "CONNECTION_LOST",
      "LOCAL_HTTP_REQUEST_TIMEOUT",
    );
    await expectCoreError(
      provider().discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
    );

    settleFetch({
      status: 200,
      redirected: false,
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        cancel,
        getReader() {
          throw new Error("LATE_BODY_MUST_ONLY_BE_CANCELLED");
        },
      },
    });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await expectCoreError(
      provider().discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
    );

    settleCleanup();
    await vi.waitFor(async () => {
      await expect(provider().discover()).resolves.toHaveLength(1);
    });
  });

  it("keeps the timeout active while the response body is hung", async () => {
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
      pull: async () => new Promise<never>(() => undefined),
    });
    const adapter = provider({
      fetch: async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      timeoutMs: 5,
    });

    await expectCoreError(
      adapter.discover(),
      "CONNECTION_LOST",
      "LOCAL_HTTP_REQUEST_TIMEOUT",
    );
    // Reader cancellation settles the tracked stream transport, so a fresh
    // explicit attempt may proceed after the timeout.
    await vi.waitFor(async () => {
      await expect(provider().discover()).resolves.toHaveLength(1);
    });
    bodyController.error(new Error("TEST_STREAM_ALREADY_RELEASED"));
  });

  it("propagates caller cancellation while fetch is pending", async () => {
    let settleFetch!: (response: unknown) => void;
    const pendingFetch = new Promise<unknown>((resolve) => {
      settleFetch = resolve;
    });
    const controller = new AbortController();
    const adapter = provider({
      fetch: async () => pendingFetch,
    });
    const discovery = adapter.discover(controller.signal);

    controller.abort();

    await expect(discovery).rejects.toMatchObject({ name: "AbortError" });
    await expectCoreError(
      provider().discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
    );

    settleFetch(jsonResponse());
    await vi.waitFor(async () => {
      await expect(provider().discover()).resolves.toHaveLength(1);
    });
  });

  it("propagates caller cancellation while the body stream is pending", async () => {
    let bodyReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      bodyReadStarted = resolve;
    });
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
      pull: async () => {
        bodyReadStarted();
        return new Promise<never>(() => undefined);
      },
    });
    const controller = new AbortController();
    const adapter = provider({
      fetch: async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const discovery = adapter.discover(controller.signal);
    await readStarted;

    controller.abort();

    await expect(discovery).rejects.toMatchObject({ name: "AbortError" });
    await expect(provider().discover()).resolves.toHaveLength(1);
    bodyController.error(new Error("TEST_STREAM_ALREADY_RELEASED"));
  });

  it("does not leak a rejected fetch diagnostic", async () => {
    const adapter = provider({
      fetch: async () => {
        throw new Error("PRIVATE_BINDING_PHRASE_FROM_BROWSER");
      },
    });

    const error = await expectCoreError(
      adapter.discover(),
      "CONNECTION_LOST",
      "LOCAL_HTTP_REQUEST_FAILED",
    );
    expect(JSON.stringify(error.operationError)).not.toContain("PRIVATE");
    expect(error.message).toBe("LOCAL_HTTP_REQUEST_FAILED");
  });

  it("requires discovery and an exact session-local device id", async () => {
    const adapter = provider();
    await expectCoreError(
      adapter.readIdentity(session("ephemeral-test-device")),
      "INVALID_STATE_TRANSITION",
      "LOCAL_HTTP_DISCOVERY_REQUIRED",
    );
    const descriptor = (await adapter.discover())[0]!;
    await expectCoreError(
      adapter.readCapabilities(session(`${descriptor.id}-other`)),
      "DEVICE_NOT_FOUND",
      "LOCAL_HTTP_SESSION_DEVICE_MISMATCH",
    );
  });

  it("returns deeply immutable sanitized snapshots", async () => {
    const adapter = provider();
    const descriptors = await adapter.discover();
    const currentSession = session(descriptors[0]!.id);
    const evidence = await adapter.readIdentity(currentSession);
    const capabilities = await adapter.readCapabilities(currentSession);

    expect(Object.isFrozen(descriptors)).toBe(true);
    expect(Object.isFrozen(descriptors[0])).toBe(true);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(evidence.every((item) => Object.isFrozen(item))).toBe(true);
    expect(evidence.every((item) => Object.isFrozen(item.source))).toBe(true);
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(capabilities.every((item) => Object.isFrozen(item))).toBe(true);
    expect(
      capabilities.every(
        (item) =>
          Object.isFrozen(item.sourceEvidenceIds) &&
          Object.isFrozen(item.limitations),
      ),
    ).toBe(true);
    expect(() =>
      (evidence as DeviceIdentityEvidenceForMutation[]).push(
        evidence[0] as DeviceIdentityEvidenceForMutation,
      ),
    ).toThrow(TypeError);
  });

  it("binds UNVALIDATED trust to one exact provider instance", () => {
    const adapter = provider();
    const other = provider({ createDeviceId: () => "other-ephemeral-device" });
    const policy = createExpressLrsLocalHttpEvidencePolicy(adapter);
    const targetTrust = policy.classify({
      provider: adapter,
      providerId: adapter.id,
      claim: identityClaims.target,
      reportedSourceKind: "expresslrs-http-config",
    });

    expect(targetTrust).toEqual({
      sourceKind: "expresslrs-http-config",
      sourceInstanceId: "local-http-reader",
      trustDomain: "self-reported-runtime-config",
      strength: "TARGET_SPECIFIC",
      reliability: "UNVALIDATED",
    });
    expect(
      policy.classify({
        provider: other,
        providerId: adapter.id,
        claim: identityClaims.target,
        reportedSourceKind: "expresslrs-http-config",
      }),
    ).toBeNull();
    expect(
      policy.classify({
        provider: adapter,
        providerId: adapter.id,
        claim: identityClaims.target,
        reportedSourceKind: "forged-source",
      }),
    ).toBeNull();
  });

  it("cannot promote the self-reported target to confirmed identity", async () => {
    const adapter = provider();
    const descriptor = (await adapter.discover())[0]!;
    const reported = await adapter.readIdentity(session(descriptor.id));
    const rebuilt = rebuildDiscoveryEvidence({
      value: reported,
      provider: adapter,
      providerId: adapter.id,
      policy: createExpressLrsLocalHttpEvidencePolicy(adapter),
    });
    const safeTargetEvidenceId =
      rebuilt.safeIdByReportedId.get("settings-target")!;
    const resolution = resolveDeviceIdentity({
      evidence: rebuilt.evidence,
      candidates: [
        {
          targetId: "vendor.rx_2400.test",
          displayName: "Catalog candidate",
          matchedEvidenceIds: [safeTargetEvidenceId],
          conflictingEvidenceIds: [],
        },
      ],
    });

    expect(
      rebuilt.evidence.find((item) => item.claim === identityClaims.target),
    ).toMatchObject({
      strength: "TARGET_SPECIFIC",
      reliability: "UNVALIDATED",
      source: { trustDomain: "self-reported-runtime-config" },
    });
    expect(resolution.confidence).toBe("UNKNOWN");
    expect(resolution.selectedTargetId).toBeNull();
    expect(resolution.reasons).toEqual([
      identityResolutionReasons.genericEvidenceOnly,
    ]);
  });

  it("exports an immutable, explicitly UNVALIDATED capability assessment", () => {
    expect(expressLrsLocalHttpCapabilityAssessment).toMatchObject({
      validation: "UNVALIDATED",
      readOnly: true,
      route: "/config",
    });
    expect(Object.isFrozen(expressLrsLocalHttpCapabilityAssessment)).toBe(true);
    expect(
      Object.isFrozen(expressLrsLocalHttpCapabilityAssessment.origins),
    ).toBe(true);
    expect(
      Object.isFrozen(expressLrsLocalHttpCapabilityAssessment.limitations),
    ).toBe(true);
  });

  it("keeps a late locked response quarantined when body cancellation rejects", async () => {
    const origin = expressLrsLocalHttpOrigins[0];
    let settleFetch!: (response: unknown) => void;
    const pendingFetch = new Promise<unknown>((resolve) => {
      settleFetch = resolve;
    });
    const locked = lockedResponse();
    const adapter = provider({
      origin,
      fetch: async () => pendingFetch,
      timeoutMs: 5,
    });

    await expectCoreError(
      adapter.discover(),
      "CONNECTION_LOST",
      "LOCAL_HTTP_REQUEST_TIMEOUT",
    );
    settleFetch(locked.response);
    await vi.waitFor(() => expect(locked.cancel).toHaveBeenCalledTimes(1));
    await expectCoreError(
      provider({ origin }).discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
    );
    await locked.releaseExternalReader();
  });

  it("rejects a dynamic thenable without releasing early response quarantine", async () => {
    const origin = expressLrsLocalHttpOrigins[1];
    let thenGetterCalls = 0;
    const dynamicThenable = Object.defineProperty({}, "then", {
      get() {
        thenGetterCalls += 1;
        return thenGetterCalls === 1
          ? () => new Promise<never>(() => undefined)
          : undefined;
      },
    });
    const cancel = vi.fn(() => dynamicThenable);
    const adapter = provider({
      origin,
      fetch: async () => ({
        status: 200,
        redirected: false,
        headers: new Headers({ "content-type": "text/html" }),
        body: {
          cancel,
          getReader() {
            throw new Error("PRIVATE_BODY_MUST_NOT_BE_READ");
          },
        },
      }),
    });

    await expectCoreError(
      adapter.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_CONTENT_TYPE_INVALID",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    // The cleanup boundary requires a genuine Promise and never evaluates the
    // attacker-controlled then getter, so its settlement cannot be forged.
    expect(thenGetterCalls).toBe(0);
    await expectCoreError(
      provider({ origin }).discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
    );
  });

  it("keeps cleanup unproven when cancel is absent and reader acquisition throws", async () => {
    const origin = expressLrsLocalHttpOrigins[2];
    const getReader = vi.fn(() => {
      throw new Error("PRIVATE_CLEANUP_FAILURE");
    });
    const adapter = provider({
      origin,
      fetch: async () => ({
        status: 200,
        redirected: false,
        headers: new Headers({ "content-type": "text/html" }),
        body: { getReader },
      }),
    });

    await expectCoreError(
      adapter.discover(),
      "PROVIDER_UNSUPPORTED",
      "LOCAL_HTTP_CONTENT_TYPE_INVALID",
    );
    expect(getReader).toHaveBeenCalledTimes(1);
    await expectCoreError(
      provider({ origin }).discover(),
      "DEVICE_BUSY",
      "LOCAL_HTTP_ORIGIN_ALREADY_IN_USE",
    );
  });
});

type DeviceIdentityEvidenceForMutation = Awaited<
  ReturnType<ExpressLrsLocalHttpDiscoveryProvider["readIdentity"]>
>[number];
