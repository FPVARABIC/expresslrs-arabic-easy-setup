export const OFFICIAL_EXPRESSLRS_ARTIFACT_BASES = Object.freeze([
  "https://expresslrs.github.io/web-flasher/assets",
  "https://artifactory.expresslrs.org/ExpressLRS",
] as const);

const ALLOWED_HOSTS = Object.freeze(
  new Set(["expresslrs.github.io", "artifactory.expresslrs.org"]),
);

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
}): Promise<Response> {
  const path = safeRelativePath(input.path);
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const failures: string[] = [];
  for (const base of OFFICIAL_EXPRESSLRS_ARTIFACT_BASES) {
    if (input.signal?.aborted === true) {
      throw new DOMException("Official artifact request was cancelled", "AbortError");
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
      if (input.signal?.aborted === true) throw error;
      failures.push(
        `${requestedUrl}: ${error instanceof Error ? error.message : "network failure"}`,
      );
    }
  }
  throw new OfficialSourceError(
    failures.some((failure) => /HTTP 404\b/u.test(failure))
      ? "NOT_FOUND"
      : "NETWORK",
    `All official ExpressLRS artifact sources failed: ${failures.join(" | ")}`,
  );
}
