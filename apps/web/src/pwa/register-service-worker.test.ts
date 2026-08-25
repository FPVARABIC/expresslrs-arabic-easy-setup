import { describe, expect, it, vi } from "vitest";

import {
  registerSafeServiceWorker,
  type ServiceWorkerRegistrationPort,
} from "./register-service-worker";

function registrationPort(register = vi.fn().mockResolvedValue({})) {
  return {
    register,
  } satisfies ServiceWorkerRegistrationPort;
}

describe("safe Service Worker registration", () => {
  it("registers the worker inside the current repository path without update-cache reuse", async () => {
    const register = vi.fn().mockResolvedValue({});
    const outcome = await registerSafeServiceWorker({
      serviceWorker: registrationPort(register),
      secureContext: true,
      documentUrl:
        "https://fpvarabic.github.io/expresslrs-arabic-easy-setup/",
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

  it("does not register in an insecure context", async () => {
    const register = vi.fn().mockResolvedValue({});
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
