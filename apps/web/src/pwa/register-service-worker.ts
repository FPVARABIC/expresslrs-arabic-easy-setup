export type ServiceWorkerRegistrationOutcome =
  "REGISTERED" | "UNAVAILABLE" | "FAILED";

export interface ServiceWorkerStatePort {
  readonly state: string;
  addEventListener(type: "statechange", listener: () => void): void;
}

export interface ServiceWorkerRegistrationView {
  readonly waiting: ServiceWorkerStatePort | null;
  readonly installing: ServiceWorkerStatePort | null;
  /**
   * The worker currently running the application, if any. A first install has
   * none, which is what tells an install apart from an update.
   */
  readonly active: ServiceWorkerStatePort | null;
  addEventListener(type: "updatefound", listener: () => void): void;
}

export interface ServiceWorkerRegistrationPort {
  register(
    scriptUrl: string,
    options: {
      readonly scope: string;
      readonly updateViaCache: "none";
    },
  ): Promise<ServiceWorkerRegistrationView>;
}

export interface RegisterSafeServiceWorkerInput {
  readonly serviceWorker?: ServiceWorkerRegistrationPort | null;
  readonly secureContext?: boolean;
  readonly documentUrl?: string | null;
  readonly onWaiting?: () => void;
  /** Whether a worker is already controlling this page. */
  readonly isControlled?: () => boolean;
}

function adaptWorker(
  worker: ServiceWorker | null,
): ServiceWorkerStatePort | null {
  if (worker === null) {
    return null;
  }
  return {
    get state() {
      return worker.state;
    },
    addEventListener(type, listener) {
      worker.addEventListener(type, listener);
    },
  };
}

function adaptRegistration(
  registration: ServiceWorkerRegistration,
): ServiceWorkerRegistrationView {
  return {
    get waiting() {
      return adaptWorker(registration.waiting);
    },
    get installing() {
      return adaptWorker(registration.installing);
    },
    get active() {
      return adaptWorker(registration.active);
    },
    addEventListener(type, listener) {
      registration.addEventListener(type, listener);
    },
  };
}

function browserIsControlled(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller !== null
  );
}

function browserServiceWorker(): ServiceWorkerRegistrationPort | null {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const container = navigator.serviceWorker;
  return {
    async register(scriptUrl, options) {
      return adaptRegistration(await container.register(scriptUrl, options));
    },
  };
}

function browserSecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true;
}

function browserDocumentUrl(): string | null {
  return typeof document === "undefined" ? null : document.baseURI;
}

function observeWaitingWorker(
  registration: ServiceWorkerRegistrationView,
  onWaiting: (() => void) | undefined,
  isControlled: () => boolean,
): void {
  if (onWaiting === undefined) {
    return;
  }

  let notified = false;
  const notifyIfWaiting = () => {
    let waiting = false;
    let replacesRunningShell = false;
    try {
      waiting = registration.waiting !== null;
      // A first install passes through `waiting` on its way to activating,
      // with no active worker and no controlled page. Reporting that as an
      // available update tells the operator their shell is out of date the
      // very first time they open it, which is false. An update is only
      // available when a waiting worker would replace one that is running.
      replacesRunningShell =
        (registration.active ?? null) !== null || isControlled();
    } catch {
      // A malformed platform view cannot create an update-ready claim.
    }
    if (notified || !waiting || !replacesRunningShell) {
      return;
    }
    notified = true;
    try {
      onWaiting();
    } catch {
      // Host presentation callbacks cannot alter registration safety.
    }
  };

  notifyIfWaiting();
  try {
    registration.addEventListener("updatefound", () => {
      try {
        const installing = registration.installing;
        if (installing === null) {
          return;
        }
        installing.addEventListener("statechange", () => {
          try {
            if (installing.state === "installed") {
              notifyIfWaiting();
            }
          } catch {
            // A malformed worker state remains unreported and inactive.
          }
        });
      } catch {
        // Platform update events are observational and cannot fail the app.
      }
    });
  } catch {
    // Registration remains usable even when update observation is unavailable.
  }
}

/**
 * Registers only the repository-scoped static Service Worker. Registration
 * never forces a waiting worker to replace an active client, so a new shell
 * cannot take over in the middle of a future sensitive workflow.
 */
export async function registerSafeServiceWorker(
  input: RegisterSafeServiceWorkerInput = {},
): Promise<ServiceWorkerRegistrationOutcome> {
  const serviceWorker =
    input.serviceWorker === undefined
      ? browserServiceWorker()
      : input.serviceWorker;
  const secureContext = input.secureContext ?? browserSecureContext();
  const documentUrl =
    input.documentUrl === undefined ? browserDocumentUrl() : input.documentUrl;
  const onWaiting = input.onWaiting;

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

    const registration = await serviceWorker.register(scriptUrl.toString(), {
      scope: scopeUrl.pathname,
      updateViaCache: "none",
    });
    observeWaitingWorker(
      registration,
      onWaiting,
      input.isControlled ?? browserIsControlled,
    );
    return "REGISTERED";
  } catch {
    return "FAILED";
  }
}
