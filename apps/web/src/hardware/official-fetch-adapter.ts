import { fetchOfficialExpressLrsResource } from "./official-source";

function officialRelativePath(input: RequestInfo | URL): string {
  const url =
    input instanceof Request
      ? new URL(input.url)
      : input instanceof URL
        ? input
        : new URL(input);
  const markers = ["/ExpressLRS/", "/web-flasher/assets/"] as const;
  for (const marker of markers) {
    const index = url.pathname.indexOf(marker);
    if (index >= 0) {
      return decodeURIComponent(url.pathname.slice(index + marker.length));
    }
  }
  throw new TypeError(
    "Artifact request is outside the official ExpressLRS roots",
  );
}

export const officialArtifactFetch: typeof fetch = async (
  input,
  init,
): Promise<Response> => {
  const signal = init?.signal;
  return fetchOfficialExpressLrsResource({
    path: officialRelativePath(input),
    ...(signal === null || signal === undefined ? {} : { signal }),
    accept:
      init?.headers instanceof Headers
        ? (init.headers.get("accept") ?? "application/octet-stream")
        : "application/octet-stream",
  });
};
