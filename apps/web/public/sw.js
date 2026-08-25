const CACHE_PREFIX = "elrs-easy-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const CACHEABLE_DESTINATIONS = new Set([
  "document",
  "script",
  "style",
  "font",
  "image",
]);
const SENSITIVE_PATH_FRAGMENTS = Object.freeze([
  "/firmware",
  "/artifacts",
  "/catalog",
  "/release",
  "/update-metadata",
  "/update-manifest",
]);

function isCacheableRequest(request) {
  if (request.method !== "GET") {
    return false;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return false;
  }

  if (
    SENSITIVE_PATH_FRAGMENTS.some((fragment) =>
      requestUrl.pathname.toLowerCase().includes(fragment),
    )
  ) {
    return false;
  }

  return CACHEABLE_DESTINATIONS.has(request.destination);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && isCacheableRequest(request)) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // Cache storage is optional. A successful network response stays valid.
      }
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached !== undefined) {
      return cached;
    }
    throw error;
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  if (!isCacheableRequest(event.request)) {
    return;
  }
  event.respondWith(networkFirst(event.request));
});
