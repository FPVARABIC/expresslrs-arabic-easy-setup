import { describe, expect, it, vi } from "vitest";

import {
  registerSafeServiceWorker,
  type ServiceWorkerRegistrationPort,
  type ServiceWorkerRegistrationView,
  type ServiceWorkerStatePort,
} from "./register-service-worker";

function registrationView(): ServiceWorkerRegistrationView {
  return {
    waiting: null,
    installing: null,
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
      addEventListener: vi.fn(),
    } satisfies ServiceWorkerRegistrationView);

    await registerSafeServiceWorker({
      serviceWorker: registrationPort(register),
      secureContext: true,
      documentUrl: "https://example.test/app/",
      onWaiting,
    });

    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it("reports a newly installed waiting worker after updatefound", async () => {
    let waitingAvailable = false;
    const installing = {
      state: "installing",
      addEventListener(_type: "statechange", listener: () => void) {
        installing.state = "installed";
        waitingAvailable = true;
        listener();
      },
    } satisfies ServiceWorkerStatePort;
    const registration = {
      get waiting() {
        return waitingAvailable ? installing : null;
      },
      installing,
      addEventListener(_type: "updatefound", listener: () => void) {
        listener();
      },
    } satisfies ServiceWorkerRegistrationView;
    const onWaiting = vi.fn();

    await registerSafeServiceWorker({
      serviceWorker: registrationPort(vi.fn().mockResolvedValue(registration)),
      secureContext: true,
      documentUrl: "https://example.test/app/",
      onWaiting,
    });

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
      addEventListener: vi.fn(),
    } satisfies ServiceWorkerRegistrationView);

    await expect(
      registerSafeServiceWorker({
        serviceWorker: registrationPort(register),
        secureContext: true,
        documentUrl: "https://example.test/app/",
        onWaiting() {
          throw new Error("secret=do-not-copy");
        },
      }),
    ).resolves.toBe("REGISTERED");
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
});
