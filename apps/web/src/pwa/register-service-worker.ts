export type ServiceWorkerRegistrationOutcome =
  "REGISTERED" | "UNAVAILABLE" | "FAILED";

export interface ServiceWorkerStatePort {
  readonly state: string;
  addEventListener(type: "statechange", listener: () => void): void;
}

export interface ServiceWorkerRegistrationView {
  readonly waiting: ServiceWorkerStatePort | null;
  readonly installing: ServiceWorkerStatePort | null;
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
  readonly documentUrl?: string;
  readonly onWaiting?: () => void;
}

function adaptWorker(worker: ServiceWorker | null): ServiceWorkerStatePort | null {
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
    addEventListener(type, listener) {
      registration.addEventListener(type, listener);
    },
  };
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
): void {
  if (onWaiting === undefined) {
    return;
  }

  let notified = false;
  const notifyIfWaiting = () => {
    if (notified || registration.waiting === null) {
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
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (installing === null) {
      return;
    }
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed") {
        notifyIfWaiting();
      }
    });
  });
}

/**
 * Registers only the repository-scoped static Service Worker. Registration
 * never forces a waiting worker to replace an active client, so a new shell
 * cannot take over in the middle of a future sensitive workflow.
 */
export async function registerSafeServiceWorker(
  input: RegisterSafeServiceWorkerInput = {},
): Promise<ServiceWorkerRegistrationOutcome> {
  const serviceWorker = input.serviceWorker ?? browserServiceWorker();
  const secureContext = input.secureContext ?? browserSecureContext();
  const documentUrl = input.documentUrl ?? browserDocumentUrl();
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
    observeWaitingWorker(registration, onWaiting);
    return "REGISTERED";
  } catch {
    return "FAILED";
  }
}
