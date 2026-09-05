import { describe, expect, it, vi } from "vitest";

import {
  fetchOfficialExpressLrsResource,
  isTrustedOfficialExpressLrsUrl,
} from "./official-source";

describe("official ExpressLRS artifact source", () => {
  it("accepts only the two pinned official HTTPS hosts", () => {
    expect(
      isTrustedOfficialExpressLrsUrl(
        "https://expresslrs.github.io/web-flasher/assets/index.json",
      ),
    ).toBe(true);
    expect(
      isTrustedOfficialExpressLrsUrl(
        "https://artifactory.expresslrs.org/ExpressLRS/index.json",
      ),
    ).toBe(true);
    expect(
      isTrustedOfficialExpressLrsUrl("https://example.com/index.json"),
    ).toBe(false);
    expect(
      isTrustedOfficialExpressLrsUrl("http://expresslrs.github.io/a"),
    ).toBe(false);
  });

  it("falls back from the Pages mirror to official Artifactory", async () => {
    const fetchImplementation = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("expresslrs.github.io")) {
        throw new TypeError("CORS blocked");
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const response = await fetchOfficialExpressLrsResource({
      path: "index.json",
      fetchImplementation,
      accept: "application/json",
    });

    expect(response.ok).toBe(true);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("rejects a successful response redirected outside official hosts", async () => {
    const fetchImplementation = vi.fn(async () => {
      const response = new Response("{}", { status: 200 });
      Object.defineProperty(response, "url", {
        configurable: true,
        value: "https://evil.example/firmware.zip",
      });
      return response;
    }) as unknown as typeof fetch;

    await expect(
      fetchOfficialExpressLrsResource({
        path: "index.json",
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "UNTRUSTED_REDIRECT" });
  });
});
