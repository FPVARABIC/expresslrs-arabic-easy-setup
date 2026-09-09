/**
 * The only artifact origin a document may contact. The reviewed browser policy
 * pins `connect-src` to `'self'`, this origin, and the three local device
 * origins; both `scripts/check-pages-build.mjs` and
 * `scripts/check-security-headers.mjs` enforce that list exactly.
 */
export const BROWSER_EXPRESSLRS_ARTIFACT_BASES = Object.freeze([
  "https://expresslrs.github.io/web-flasher/assets",
] as const);

/**
 * Official Artifactory is a real mirror, but a document can never reach it:
 * Chromium refuses the request against the deployed Pages policy with
 * "Refused to connect ... because it violates the following Content Security
 * Policy directive: connect-src ...". It is kept for Node callers (the
 * network-gated live suites and tooling), where no document policy applies, so
 * the redundancy survives where it demonstrably works instead of being
 * advertised in a browser where it cannot.
 */
export const NODE_ONLY_EXPRESSLRS_ARTIFACT_BASES = Object.freeze([
  "https://artifactory.expresslrs.org/ExpressLRS",
] as const);

export const OFFICIAL_EXPRESSLRS_ARTIFACT_BASES = Object.freeze([
  ...BROWSER_EXPRESSLRS_ARTIFACT_BASES,
  ...NODE_ONLY_EXPRESSLRS_ARTIFACT_BASES,
] as const);

import { isAbortRequested } from "./byte-utils";
const ALLOWED_HOSTS = Object.freeze(
  new Set(["expresslrs.github.io", "artifactory.expresslrs.org"]),
);

/**
 * A document is exactly the context in which a Content Security Policy applies,
 * so the runtime capability is tested directly rather than inferred from a
 * User-Agent string.
 */
function documentContext(): boolean {
  return typeof (globalThis as { document?: unknown }).document !== "undefined";
}

export function officialExpressLrsArtifactBases(
  browserContext: boolean = documentContext(),
): readonly string[] {
  return browserContext
    ? BROWSER_EXPRESSLRS_ARTIFACT_BASES
    : OFFICIAL_EXPRESSLRS_ARTIFACT_BASES;
}

export class OfficialSourceError extends Error {
  public constructor(
    public readonly code: "NETWORK" | "UNTRUSTED_REDIRECT" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "OfficialSourceError";
  }
}

function safeRelativePath(value: string): string {
  const path = value.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  if (
    path.length === 0 ||
    path.length > 512 ||
    path.includes("..") ||
    /[\u0000-\u001f\u007f]/u.test(path)
  ) {
    throw new TypeError("Official ExpressLRS artifact path is unsafe");
  }
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function isTrustedOfficialExpressLrsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function fetchOfficialExpressLrsResource(input: {
  readonly path: string;
  readonly signal?: AbortSignal;
  readonly fetchImplementation?: typeof fetch;
  readonly accept?: string;
  readonly browserContext?: boolean;
}): Promise<Response> {
  const path = safeRelativePath(input.path);
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const failures: string[] = [];
  const bases = officialExpressLrsArtifactBases(input.browserContext);
  for (const base of bases) {
    if (isAbortRequested(input.signal)) {
      throw new DOMException(
        "Official artifact request was cancelled",
        "AbortError",
      );
    }
    const requestedUrl = `${base}/${path}`;
    try {
      const response = await fetchImplementation(requestedUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        headers: { Accept: input.accept ?? "application/octet-stream" },
      });
      const finalUrl = response.url || requestedUrl;
      if (!isTrustedOfficialExpressLrsUrl(finalUrl)) {
        throw new OfficialSourceError(
          "UNTRUSTED_REDIRECT",
          `Official request redirected to an untrusted host: ${finalUrl}`,
        );
      }
      if (response.ok) return response;
      failures.push(`${requestedUrl}: HTTP ${response.status}`);
    } catch (error: unknown) {
      if (error instanceof OfficialSourceError) throw error;
      if (isAbortRequested(input.signal)) throw error;
      failures.push(
        `${requestedUrl}: ${error instanceof Error ? error.message : "network failure"}`,
      );
    }
  }
  // Name only the sources that were actually contacted. Claiming that "all"
  // mirrors failed while a document silently never contacted the Artifactory
  // mirror would misdescribe the failure to the operator.
  const scope =
    bases.length === 1
      ? "The only browser-reachable official ExpressLRS artifact source failed"
      : "All official ExpressLRS artifact sources failed";
  throw new OfficialSourceError(
    failures.some((failure) => /HTTP 404\b/u.test(failure))
      ? "NOT_FOUND"
      : "NETWORK",
    `${scope}: ${failures.join(" | ")}`,
  );
}
