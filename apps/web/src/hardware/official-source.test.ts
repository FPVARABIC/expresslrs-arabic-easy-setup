import { describe, expect, it, vi } from "vitest";

import {
  fetchOfficialExpressLrsResource,
  isTrustedOfficialExpressLrsUrl,
  officialExpressLrsArtifactBases,
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

  it("never contacts the Artifactory mirror from a document context", async () => {
    // Chromium refuses that origin against the deployed Pages CSP, so a
    // document must not advertise a fallback it can never use.
    const requested: string[] = [];
    const fetchImplementation = vi.fn(async (url: string | URL | Request) => {
      requested.push(String(url));
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(
      fetchOfficialExpressLrsResource({
        path: "index.json",
        fetchImplementation,
        browserContext: true,
      }),
    ).rejects.toMatchObject({ code: "NETWORK" });

    expect(requested).toEqual([
      "https://expresslrs.github.io/web-flasher/assets/index.json",
    ]);
    expect(requested.some((url) => url.includes("artifactory"))).toBe(false);
  });

  it("describes a browser failure without claiming every mirror was tried", async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(
      fetchOfficialExpressLrsResource({
        path: "index.json",
        fetchImplementation,
        browserContext: true,
      }),
    ).rejects.toThrow(/only browser-reachable/u);
  });

  it("keeps both mirrors for Node callers where no document policy applies", () => {
    expect(officialExpressLrsArtifactBases(false)).toEqual([
      "https://expresslrs.github.io/web-flasher/assets",
      "https://artifactory.expresslrs.org/ExpressLRS",
    ]);
    expect(officialExpressLrsArtifactBases(true)).toEqual([
      "https://expresslrs.github.io/web-flasher/assets",
    ]);
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
