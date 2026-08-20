import { describe, expect, it, vi } from "vitest";
import type { BrowserFetch } from "@elrs-easy/platform-browser";

import {
  expressLrsLocalHttpOrigins,
  runLocalHttpDiscovery,
} from "./localHttpDiscovery.js";

function configResponse(
  settings: Readonly<Record<string, unknown>> = {},
): Response {
  return new Response(
    JSON.stringify({
      settings: {
        product_name: "Example WiFi Receiver",
        target: "EXAMPLE_RX_2400",
        version: "4.1.0",
        "git-commit": "a9d4a9c",
        "module-type": "RX",
        "radio-type": "SX128X",
        has_low_band: false,
        has_high_band: true,
        reg_domain_high: "ISM_2400",
        custom_hardware: false,
        ssid: "must-not-cross",
        ...settings,
      },
      config: { uid: [1, 2, 3, 4, 5, 6] },
      options: {
        "wifi-ssid": "private-network",
        "wifi-password": "private-password",
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("Web Local HTTP discovery composition", () => {
  it("collects only safe reported facts and keeps identity unknown", async () => {
    const fetch = vi.fn<BrowserFetch>(async () => configResponse());

    const outcome = await runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[0],
      fetch,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(outcome.state).toBe("SUCCESS");
    expect(outcome.factsCollected).toBe(true);
    expect(outcome.verificationPassed).toBe(true);
    expect(outcome.confidence).toBe("UNKNOWN");
    expect(outcome.retryable).toBe(false);
    expect(outcome.facts).toEqual([
      { key: "product", value: "Example WiFi Receiver" },
      { key: "target", value: "EXAMPLE_RX_2400" },
      { key: "version", value: "4.1.0" },
      { key: "commit", value: "a9d4a9c" },
      { key: "role", value: "RX" },
      { key: "radio", value: "SX128X" },
      { key: "band", value: "HIGH_BAND" },
      { key: "regHigh", value: "ISM_2400" },
      { key: "custom", value: "false" },
    ]);
  });

  it("never returns UID, SSID, password, options, or the raw response", async () => {
    const outcome = await runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[1],
      fetch: async () => configResponse(),
    });
    const serialized = JSON.stringify(outcome);

    expect(serialized).not.toContain("1,2,3,4,5,6");
    expect(serialized).not.toContain("must-not-cross");
    expect(serialized).not.toContain("private-network");
    expect(serialized).not.toContain("private-password");
    expect(serialized).not.toContain("options");
  });

  it("maps an already-cancelled request to CANCELLED without fetching", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn<BrowserFetch>(async () => configResponse());

    const outcome = await runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[2],
      signal: controller.signal,
      fetch,
    });

    expect(outcome.state).toBe("CANCELLED");
    expect(outcome.verificationPassed).toBe(false);
    expect(outcome.retryable).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps a malformed device response to a structured non-success", async () => {
    const outcome = await runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[0],
      fetch: async () =>
        new Response(JSON.stringify({ settings: {}, config: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    expect(outcome.state).toBe("FAILED");
    expect(outcome.factsCollected).toBe(false);
    expect(outcome.errorCode).toBe("PROVIDER_UNSUPPORTED");
    expect(outcome.retryable).toBe(false);
  });

  it.each([
    { has_low_band: true, has_high_band: undefined },
    { has_low_band: undefined, has_high_band: true },
    { has_low_band: false, has_high_band: undefined },
    { has_low_band: undefined, has_high_band: false },
    { has_low_band: false, has_high_band: false },
  ])("keeps partial or negative band flags safe and unknown", async (flags) => {
    const outcome = await runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[0],
      fetch: async () =>
        configResponse({
          product_name: "Partial Band Receiver",
          target: "PARTIAL_BAND_RX",
          version: "4.1.0",
          "module-type": "RX",
          ...flags,
        }),
    });

    expect(outcome.state).toBe("SUCCESS");
    expect(outcome.confidence).toBe("UNKNOWN");
    expect(outcome.facts.some((fact) => fact.key === "band")).toBe(false);
  });

  it("returns structured DEVICE_BUSY for overlapping reads of one origin", async () => {
    let releaseFetch!: (response: Response) => void;
    const heldResponse = new Promise<Response>((resolve) => {
      releaseFetch = resolve;
    });
    const fetch = vi.fn(async () => heldResponse);
    const first = runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[0],
      fetch,
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const overlapping = await runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[0],
      fetch,
    });

    expect(overlapping).toMatchObject({
      state: "FAILED",
      errorCode: "DEVICE_BUSY",
      retryable: true,
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    releaseFetch(configResponse());
    await expect(first).resolves.toMatchObject({ state: "SUCCESS" });
  });

  it("snapshots getter-backed host inputs before any network await", async () => {
    let originReads = 0;
    let fetchReads = 0;
    let signalReads = 0;
    const fetch = vi.fn<BrowserFetch>(async () => configResponse());
    const request = {
      get origin(): (typeof expressLrsLocalHttpOrigins)[number] {
        originReads += 1;
        return originReads === 1
          ? expressLrsLocalHttpOrigins[0]
          : expressLrsLocalHttpOrigins[2];
      },
      get fetch() {
        fetchReads += 1;
        return fetch;
      },
      get signal() {
        signalReads += 1;
        return undefined;
      },
    };

    const outcome = await runLocalHttpDiscovery(request);

    expect(outcome.state).toBe("SUCCESS");
    expect(fetch.mock.calls[0]?.[0]).toBe("http://10.0.0.1/config");
    expect(originReads).toBe(1);
    expect(fetchReads).toBe(1);
    expect(signalReads).toBe(1);
  });
});
