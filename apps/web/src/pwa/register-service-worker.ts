export type ServiceWorkerRegistrationOutcome =
  "REGISTERED" | "UNAVAILABLE" | "FAILED";

export interface ServiceWorkerRegistrationPort {
  register(
    scriptUrl: string,
    options: {
      readonly scope: string;
      readonly updateViaCache: "none";
    },
  ): Promise<unknown>;
}

export interface RegisterSafeServiceWorkerInput {
  readonly serviceWorker?: ServiceWorkerRegistrationPort | null;
  readonly secureContext?: boolean;
  readonly documentUrl?: string;
}

function browserServiceWorker(): ServiceWorkerRegistrationPort | null {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker;
}

function browserSecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true;
}

function browserDocumentUrl(): string | null {
  return typeof document === "undefined" ? null : document.baseURI;
}

/**
 * Registers only the repository-scoped static Service Worker. Registration
 * never calls update(), skipWaiting(), or any activation shortcut, so a new
 * shell cannot replace an active client in the middle of a future sensitive
 * workflow.
 */
export async function registerSafeServiceWorker(
  input: RegisterSafeServiceWorkerInput = {},
): Promise<ServiceWorkerRegistrationOutcome> {
  const serviceWorker = input.serviceWorker ?? browserServiceWorker();
  const secureContext = input.secureContext ?? browserSecureContext();
  const documentUrl = input.documentUrl ?? browserDocumentUrl();

  if (!secureContext || serviceWorker === null || documentUrl === null) {
    return "UNAVAILABLE";
  }

  try {
    const pageUrl = new URL(documentUrl);
    const scriptUrl = new URL("./sw.js", pageUrl);
    const scopeUrl = new URL("./", pageUrl);
    if (
      scriptUrl.origin !== pageUrl.origin ||
      scopeUrl.origin !== pageUrl.origin
    ) {
      return "FAILED";
    }

    await serviceWorker.register(scriptUrl.toString(), {
      scope: scopeUrl.pathname,
      updateViaCache: "none",
    });
    return "REGISTERED";
  } catch {
    return "FAILED";
  }
}
