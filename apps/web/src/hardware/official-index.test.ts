import { describe, expect, it } from "vitest";

import { parseOfficialReleaseIndexFlexible } from "./official-index";

describe("flexible official release index", () => {
  it("parses the simple label-to-revision map", () => {
    const releaseSha = "a".repeat(40);
    const branchSha = "b".repeat(40);
    expect(
      parseOfficialReleaseIndexFlexible({
        tags: { "4.1.0": releaseSha },
        branches: { master: branchSha },
      }),
    ).toEqual([
      { label: "4.1.0", revision: releaseSha, channel: "release" },
      { label: "master", revision: branchSha, channel: "branch" },
    ]);
  });

  it("parses object and array records used by alternate official indexes", () => {
    const releases = parseOfficialReleaseIndexFlexible({
      releases: [
        { version: "4.0.0", commit: "a".repeat(40) },
        { name: "4.1.0", sha: "b".repeat(40) },
      ],
      branches: {
        master: { commit: "c".repeat(40), name: "master" },
      },
    });

    expect(releases.map((release) => release.label)).toEqual([
      "4.1.0",
      "4.0.0",
      "master",
    ]);
  });

  it("orders stable and numbered prereleases by version precedence", () => {
    const releases = parseOfficialReleaseIndexFlexible({
      tags: {
        "4.2.0-RC2": "d".repeat(40),
        "4.2.0-RC10": "c".repeat(40),
        "4.2.0": "b".repeat(40),
        "4.1.0": "a".repeat(40),
      },
    });

    expect(releases.map((release) => release.label)).toEqual([
      "4.2.0",
      "4.2.0-RC10",
      "4.2.0-RC2",
      "4.1.0",
    ]);
  });

  it("sorts all bounded candidates before applying the exact release cap", () => {
    const tags = Object.fromEntries(
      Array.from({ length: 258 }, (_, index) => [
        `1.0.${index}`,
        index.toString(16).padStart(40, "0"),
      ]),
    );

    const releases = parseOfficialReleaseIndexFlexible({
      tags,
      branches: { master: "f".repeat(40) },
    });

    expect(releases).toHaveLength(256);
    expect(releases.slice(0, 2).map((release) => release.label)).toEqual([
      "1.0.257",
      "1.0.256",
    ]);
    expect(releases.some((release) => release.label === "master")).toBe(false);
  });

  it("rejects prototype paths and unbounded labels", () => {
    const releases = parseOfficialReleaseIndexFlexible({
      tags: {
        safe: "a".repeat(40),
        "../escape": "b".repeat(40),
        ["x".repeat(200)]: "ignored",
        abbreviated: "abc123",
      },
    });

    expect(releases).toEqual([
      { label: "safe", revision: "a".repeat(40), channel: "release" },
    ]);
  });
});
