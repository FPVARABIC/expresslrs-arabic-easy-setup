import { describe, expect, it, vi } from "vitest";

import {
  registerSafeServiceWorker,
  type ServiceWorkerRegistrationPort,
  type ServiceWorkerRegistrationView,
  type ServiceWorkerStatePort,
} from "./register-service-worker";

function worker(state = "activated"): ServiceWorkerStatePort {
  return { state, addEventListener: vi.fn() };
}

function registrationView(): ServiceWorkerRegistrationView {
  return {
    waiting: null,
    installing: null,
    active: null,
    addEventListener: vi.fn(),
  };
}

function registrationPort(
  register = vi.fn().mockResolvedValue(registrationView()),
) {
  return {
    register,
  } satisfies ServiceWorkerRegistrationPort;
}

describe("safe Service Worker registration", () => {
  it("registers the worker inside the current repository path without update-cache reuse", async () => {
    const register = vi.fn().mockResolvedValue(registrationView());
    const outcome = await registerSafeServiceWorker({
      serviceWorker: registrationPort(register),
      secureContext: true,
      documentUrl: "https://fpvarabic.github.io/expresslrs-arabic-easy-setup/",
    });

    expect(outcome).toBe("REGISTERED");
    expect(register).toHaveBeenCalledWith(
      "https://fpvarabic.github.io/expresslrs-arabic-easy-setup/sw.js",
      {
        scope: "/expresslrs-arabic-easy-setup/",
        updateViaCache: "none",
      },
    );
  });

  it("reports an already waiting worker without forcing activation", async () => {
    const onWaiting = vi.fn();
    const waiting: ServiceWorkerStatePort = {
      state: "installed",
      addEventListener: vi.fn(),
    };
    const register = vi.fn().mockResolvedValue({
      waiting,
      installing: null,
      active: worker(),
      addEventListener: vi.fn(),
    } satisfies ServiceWorkerRegistrationView);

    await registerSafeServiceWorker({
      serviceWorker: registrationPort(register),
      secureContext: true,
      documentUrl: "https://example.test/app/",
      onWaiting,
      isControlled: () => true,
    });

    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it("reports a newly installed waiting worker after updatefound", async () => {
    let updateFound: () => void = () => {
      throw new Error("updatefound listener was not registered");
    };
    let stateChanged: () => void = () => {
      throw new Error("statechange listener was not registered");
    };
    const installing = {
      state: "installing",
      addEventListener(_type: "statechange", listener: () => void) {
        stateChanged = listener;
      },
    } satisfies ServiceWorkerStatePort;
    const registration = {
      waiting: null as ServiceWorkerStatePort | null,
      installing,
      // An update replaces a shell that is already running.
      active: worker(),
      addEventListener(_type: "updatefound", listener: () => void) {
        updateFound = listener;
      },
    } satisfies ServiceWorkerRegistrationView;
    const onWaiting = vi.fn();

    await registerSafeServiceWorker({
      serviceWorker: registrationPort(vi.fn().mockResolvedValue(registration)),
      secureContext: true,
      documentUrl: "https://example.test/app/",
      onWaiting,
      isControlled: () => true,
    });

    updateFound();
    installing.state = "installed";
    registration.waiting = installing;
    stateChanged();
    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it("contains presentation callback failures without failing registration", async () => {
    const waiting: ServiceWorkerStatePort = {
      state: "installed",
      addEventListener: vi.fn(),
    };
    const register = vi.fn().mockResolvedValue({
      waiting,
      installing: null,
      active: worker(),
      addEventListener: vi.fn(),
    } satisfies ServiceWorkerRegistrationView);

    await expect(
      registerSafeServiceWorker({
        serviceWorker: registrationPort(register),
        secureContext: true,
        documentUrl: "https://example.test/app/",
        isControlled: () => true,
        onWaiting() {
          throw new Error("secret=do-not-copy");
        },
      }),
    ).resolves.toBe("REGISTERED");
  });

  it("contains malformed late update events without creating a waiting claim", async () => {
    let updateFound: () => void = () => {
      throw new Error("updatefound listener was not registered");
    };
    const onWaiting = vi.fn();
    const registration = {
      waiting: null,
      active: null,
      get installing(): ServiceWorkerStatePort | null {
        throw new Error("secret=malformed-platform-view");
      },
      addEventListener(_type: "updatefound", listener: () => void) {
        updateFound = listener;
      },
    } satisfies ServiceWorkerRegistrationView;

    await expect(
      registerSafeServiceWorker({
        serviceWorker: registrationPort(
          vi.fn().mockResolvedValue(registration),
        ),
        secureContext: true,
        documentUrl: "https://example.test/app/",
        onWaiting,
      }),
    ).resolves.toBe("REGISTERED");
    expect(() => updateFound()).not.toThrow();
    expect(onWaiting).not.toHaveBeenCalled();
  });

  it("does not register in an insecure context", async () => {
    const register = vi.fn().mockResolvedValue(registrationView());
    await expect(
      registerSafeServiceWorker({
        serviceWorker: registrationPort(register),
        secureContext: false,
        documentUrl: "http://example.test/app/",
      }),
    ).resolves.toBe("UNAVAILABLE");
    expect(register).not.toHaveBeenCalled();
  });

  it("reports unavailable when the platform has no Service Worker port", async () => {
    await expect(
      registerSafeServiceWorker({
        serviceWorker: null,
        secureContext: true,
        documentUrl: "https://example.test/app/",
      }),
    ).resolves.toBe("UNAVAILABLE");
  });

  it("reports unavailable for an explicitly absent document URL", async () => {
    await expect(
      registerSafeServiceWorker({
        serviceWorker: registrationPort(),
        secureContext: true,
        documentUrl: null,
      }),
    ).resolves.toBe("UNAVAILABLE");
  });

  it("sanitizes registration failures into a fixed outcome", async () => {
    const register = vi.fn().mockRejectedValue(new Error("secret=do-not-copy"));
    await expect(
      registerSafeServiceWorker({
        serviceWorker: registrationPort(register),
        secureContext: true,
        documentUrl: "https://example.test/app/",
      }),
    ).resolves.toBe("FAILED");
  });

  // A first install passes through `waiting` on its way to activating. The
  // observed Chromium sequence is:
  //   registered:  active=null waiting=null   installing=installing
  //   statechange: installed  waiting=installed active=null controller=false
  //   statechange: activating waiting=null     active=activating
  // Reporting the middle line as an available update told a first-time visitor
  // their shell was out of date before they had ever loaded it.
  it("does not report an update on a first install", async () => {
    const onWaiting = vi.fn();
    let updateFound: () => void = () => {
      throw new Error("updatefound listener was not registered");
    };
    let stateChanged: () => void = () => {
      throw new Error("statechange listener was not registered");
    };
    const installing = {
      state: "installing",
      addEventListener(_type: "statechange", listener: () => void) {
        stateChanged = listener;
      },
    } satisfies ServiceWorkerStatePort;
    const registration = {
      waiting: null as ServiceWorkerStatePort | null,
      installing,
      // No worker is running yet: this is an install, not an update.
      active: null as ServiceWorkerStatePort | null,
      addEventListener(_type: "updatefound", listener: () => void) {
        updateFound = listener;
      },
    } satisfies ServiceWorkerRegistrationView;

    await registerSafeServiceWorker({
      serviceWorker: registrationPort(vi.fn().mockResolvedValue(registration)),
      secureContext: true,
      documentUrl: "https://example.test/app/",
      onWaiting,
      isControlled: () => false,
    });

    updateFound();
    installing.state = "installed";
    registration.waiting = installing;
    stateChanged();
    expect(onWaiting).not.toHaveBeenCalled();

    // And the rest of the install is equally silent.
    installing.state = "activating";
    registration.waiting = null;
    registration.active = installing;
    stateChanged();
    installing.state = "activated";
    stateChanged();
    expect(onWaiting).not.toHaveBeenCalled();
  });

  it("does not report an update when a controlled page finds no waiting worker", async () => {
    const onWaiting = vi.fn();
    const register = vi.fn().mockResolvedValue({
      waiting: null,
      installing: null,
      active: worker(),
      addEventListener: vi.fn(),
    } satisfies ServiceWorkerRegistrationView);

    await registerSafeServiceWorker({
      serviceWorker: registrationPort(register),
      secureContext: true,
      documentUrl: "https://example.test/app/",
      onWaiting,
      isControlled: () => true,
    });

    expect(onWaiting).not.toHaveBeenCalled();
  });

  it("reports an update when a waiting worker would replace a running one", async () => {
    const onWaiting = vi.fn();
    let updateFound: () => void = () => {
      throw new Error("updatefound listener was not registered");
    };
    let stateChanged: () => void = () => {
      throw new Error("statechange listener was not registered");
    };
    const installing = {
      state: "installing",
      addEventListener(_type: "statechange", listener: () => void) {
        stateChanged = listener;
      },
    } satisfies ServiceWorkerStatePort;
    const registration = {
      waiting: null as ServiceWorkerStatePort | null,
      installing,
      active: worker(),
      addEventListener(_type: "updatefound", listener: () => void) {
        updateFound = listener;
      },
    } satisfies ServiceWorkerRegistrationView;

    await registerSafeServiceWorker({
      serviceWorker: registrationPort(vi.fn().mockResolvedValue(registration)),
      secureContext: true,
      documentUrl: "https://example.test/app/",
      onWaiting,
      isControlled: () => true,
    });

    updateFound();
    installing.state = "installed";
    registration.waiting = installing;
    stateChanged();
    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it("treats a page controlled by an older worker as an update even without an active view", async () => {
    const onWaiting = vi.fn();
    const register = vi.fn().mockResolvedValue({
      waiting: worker("installed"),
      installing: null,
      active: null,
      addEventListener: vi.fn(),
    } satisfies ServiceWorkerRegistrationView);

    await registerSafeServiceWorker({
      serviceWorker: registrationPort(register),
      secureContext: true,
      documentUrl: "https://example.test/app/",
      onWaiting,
      isControlled: () => true,
    });

    expect(onWaiting).toHaveBeenCalledTimes(1);
  });
});
