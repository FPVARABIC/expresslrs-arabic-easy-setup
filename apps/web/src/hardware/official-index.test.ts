import { describe, expect, it } from "vitest";

import { parseOfficialReleaseIndexFlexible } from "./official-index";

describe("flexible official release index", () => {
  it("parses the simple label-to-revision map", () => {
    expect(
      parseOfficialReleaseIndexFlexible({
        tags: { "4.1.0": "release410" },
        branches: { master: "abcdef" },
      }),
    ).toEqual([
      { label: "4.1.0", revision: "release410", channel: "release" },
      { label: "master", revision: "abcdef", channel: "branch" },
    ]);
  });

  it("parses object and array records used by alternate official indexes", () => {
    const releases = parseOfficialReleaseIndexFlexible({
      releases: [
        { version: "4.0.0", commit: "release400" },
        { name: "4.1.0", sha: "release410" },
      ],
      branches: {
        master: { commit: "abcdef", name: "master" },
      },
    });

    expect(releases.map((release) => release.label)).toEqual([
      "4.1.0",
      "4.0.0",
      "master",
    ]);
  });

  it("rejects prototype paths and unbounded labels", () => {
    const releases = parseOfficialReleaseIndexFlexible({
      tags: {
        safe: "abc123",
        "../escape": "def456",
        ["x".repeat(200)]: "ignored",
      },
    });

    expect(releases).toEqual([
      { label: "safe", revision: "abc123", channel: "release" },
    ]);
  });
});
