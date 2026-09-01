import { describe, expect, it, vi } from "vitest";
import type { BrowserFetch } from "@elrs-easy/platform-browser";

import {
  expressLrsLocalHttpOrigins,
  runLocalHttpDiscovery,
} from "./localHttpDiscovery.js";

function configResponse(): Response {
  return new Response(
    JSON.stringify({
      settings: {
        product_name: "Permission Test Receiver",
        target: "PERMISSION_TEST_RX",
        version: "4.1.0",
        "git-commit": "a9d4a9c",
        "module-type": "RX",
        "radio-type": "SX128X",
        has_low_band: false,
        has_high_band: true,
        reg_domain_high: "ISM_2400",
        custom_hardware: false,
      },
      config: {},
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("Web Local HTTP local-network permission composition", () => {
  it("returns PERMISSION_DENIED before fetch when the browser explicitly denies local-network access", async () => {
    const fetch = vi.fn<BrowserFetch>(async () => configResponse());

    const outcome = await runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[0],
      fetch,
      permissionAssessment: async () => "DENIED",
    });

    expect(outcome).toMatchObject({
      state: "FAILED",
      errorCode: "PERMISSION_DENIED",
      retryable: false,
      factsCollected: false,
      verificationPassed: false,
    });
    expect(outcome.stageCategories).toEqual(["FAILED"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("continues through the real fetch path when the browser still needs to prompt", async () => {
    const fetch = vi.fn<BrowserFetch>(async () => configResponse());

    const outcome = await runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[0],
      fetch,
      permissionAssessment: async () => "PROMPT",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      state: "SUCCESS",
      errorCode: null,
      factsCollected: true,
    });
  });

  it("continues when the browser has no queryable local-network permission state", async () => {
    const fetch = vi.fn<BrowserFetch>(async () => configResponse());

    const outcome = await runLocalHttpDiscovery({
      origin: expressLrsLocalHttpOrigins[1],
      fetch,
      permissionAssessment: async () => "UNAVAILABLE",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(outcome.state).toBe("SUCCESS");
  });
});
