import { describe, expect, it } from "vitest";

import { createPlatformReadinessPlan } from "./platform-readiness.js";

describe("createPlatformReadinessPlan", () => {
  it("prefers Local HTTP on desktop when it is implemented", () => {
    const plan = createPlatformReadinessPlan({
      host: "WEB_DESKTOP",
      adapters: [
        { adapter: "WEB_SERIAL", implemented: true },
        { adapter: "LOCAL_HTTP", implemented: true },
      ],
    });

    expect(plan.readCandidates).toEqual(["LOCAL_HTTP", "WEB_SERIAL"]);
    expect(plan.preferredReadCandidate).toBe("LOCAL_HTTP");
    expect(plan.nextGate).toBe("HARDWARE_BROWSER_MATRIX");
  });

  it("keeps every write blocked even when a read adapter exists", () => {
    const plan = createPlatformReadinessPlan({
      host: "WEB_ANDROID",
      adapters: [{ adapter: "WEB_SERIAL", implemented: true }],
    });

    expect(plan.writeDisposition).toBe("BLOCKED_PENDING_HARDWARE_VALIDATION");
    expect(plan.hardwareValidation).toBe("NONE");
    expect(plan.validationLevel).toBe("SOFTWARE_ONLY");
  });

  it("requests a native bridge spike only when Android Web has no read path", () => {
    const plan = createPlatformReadinessPlan({
      host: "WEB_ANDROID",
      adapters: [
        { adapter: "LOCAL_HTTP", implemented: false },
        { adapter: "WEB_SERIAL", implemented: false },
        { adapter: "WEB_USB", implemented: false },
      ],
    });

    expect(plan.nativeBridgeDisposition).toBe("CANDIDATE_REQUIRED");
    expect(plan.nextGate).toBe("NATIVE_BRIDGE_SPIKE");
  });

  it("does not request a native bridge when Android Web already has a candidate", () => {
    const plan = createPlatformReadinessPlan({
      host: "WEB_ANDROID",
      adapters: [{ adapter: "LOCAL_HTTP", implemented: true }],
    });

    expect(plan.nativeBridgeDisposition).toBe(
      "NOT_REQUIRED_BY_SOFTWARE_CAPABILITIES",
    );
    expect(plan.nextGate).toBe("HARDWARE_BROWSER_MATRIX");
  });

  it("prefers native USB only on the native Android host", () => {
    const plan = createPlatformReadinessPlan({
      host: "ANDROID_NATIVE",
      adapters: [
        { adapter: "LOCAL_HTTP", implemented: true },
        { adapter: "NATIVE_USB", implemented: true },
      ],
    });

    expect(plan.readCandidates).toEqual(["NATIVE_USB", "LOCAL_HTTP"]);
    expect(plan.preferredReadCandidate).toBe("NATIVE_USB");
    expect(plan.nativeBridgeDisposition).toBe("NATIVE_HOST_SELECTED");
    expect(plan.nextGate).toBe("ANDROID_HARDWARE_MATRIX");
  });

  it("ignores duplicate and unavailable adapter declarations", () => {
    const plan = createPlatformReadinessPlan({
      host: "WEB_DESKTOP",
      adapters: [
        { adapter: "WEB_SERIAL", implemented: false },
        { adapter: "WEB_SERIAL", implemented: true },
        { adapter: "WEB_SERIAL", implemented: true },
      ],
    });

    expect(plan.readCandidates).toEqual(["WEB_SERIAL"]);
  });

  it("returns an explicit no-adapter gate instead of guessing", () => {
    const plan = createPlatformReadinessPlan({
      host: "WEB_DESKTOP",
      adapters: [],
    });

    expect(plan.preferredReadCandidate).toBeNull();
    expect(plan.nextGate).toBe("NO_IMPLEMENTED_READ_ADAPTER");
  });

  it("returns immutable candidate lists and plans", () => {
    const plan = createPlatformReadinessPlan({
      host: "WEB_DESKTOP",
      adapters: [{ adapter: "LOCAL_HTTP", implemented: true }],
    });

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.readCandidates)).toBe(true);
  });

  it("fails closed on an unknown runtime host without guessing a platform", () => {
    const plan = createPlatformReadinessPlan({
      host: "UNREVIEWED_HOST",
      adapters: [],
    });

    expect(plan.status).toBe("INVALID");
    expect(plan.invalidReason).toBe("INVALID_HOST");
    expect(plan.host).toBeNull();
    expect(plan.nextGate).toBe("INVALID_INPUT");
    expect(plan.writeDisposition).toBe("BLOCKED_PENDING_HARDWARE_VALIDATION");
  });

  it("does not execute accessor-backed adapter declarations", () => {
    let executed = false;
    const adapter = Object.defineProperty({}, "adapter", {
      get() {
        executed = true;
        return "LOCAL_HTTP";
      },
    });
    Object.defineProperty(adapter, "implemented", { value: true });

    const plan = createPlatformReadinessPlan({
      host: "WEB_DESKTOP",
      adapters: [adapter],
    });

    expect(executed).toBe(false);
    expect(plan.status).toBe("INVALID");
    expect(plan.invalidReason).toBe("INVALID_ADAPTERS");
    expect(plan.readCandidates).toEqual([]);
  });
});
