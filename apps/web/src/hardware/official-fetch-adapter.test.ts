import { afterEach, describe, expect, it, vi } from "vitest";

import { officialArtifactFetch } from "./official-fetch-adapter";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("official artifact compatibility adapter", () => {
  it("maps Artifactory paths to the trusted official-source request", async () => {
    globalThis.fetch = vi.fn(async (input) =>
      new Response("ok", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    ) as unknown as typeof fetch;

    const response = await officialArtifactFetch(
      "https://artifactory.expresslrs.org/ExpressLRS/release410/firmware.zip",
    );

    expect(await response.text()).toBe("ok");
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("rejects URLs outside the two official roots", async () => {
    await expect(
      officialArtifactFetch("https://evil.example/firmware.zip"),
    ).rejects.toThrow(/outside the official ExpressLRS roots/iu);
  });
});
