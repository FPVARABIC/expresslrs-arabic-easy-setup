import type { TargetDefinition } from "@elrs-easy/compatibility";
import type { FirmwareUpdateMethod } from "@elrs-easy/domain";
import { describe, expect, it } from "vitest";

import {
  selectFirmwareUpdateProvider,
  type FirmwareUpdateProvider,
} from "./index.js";

const target: TargetDefinition = Object.freeze({
  targetId: "fixture.tx.multi-method",
  displayName: "Synthetic Multi-method TX",
  identity: Object.freeze({ "device-role": Object.freeze(["tx"]) }),
  capabilities: Object.freeze([]),
  updateMethods: Object.freeze(["WIFI_OTA", "UART"] as const),
  supportedFirmwareMajors: Object.freeze([4]),
});

function provider(
  id: string,
  updateMethod: FirmwareUpdateMethod,
): FirmwareUpdateProvider {
  return Object.freeze({
    id,
    assurance: "SYNTHETIC_ONLY",
    updateMethod,
    updateCapabilityId: `${id}-update`,
  }) as unknown as FirmwareUpdateProvider;
}

describe("automatic Firmware update provider selection", () => {
  it("uses Target method preference instead of provider registration order", () => {
    const serial = provider("mock-serial", "UART");
    const wifi = provider("mock-wifi", "WIFI_OTA");

    const selection = selectFirmwareUpdateProvider({
      target,
      providers: [serial, wifi],
    });

    expect(selection).toMatchObject({
      status: "SELECTED",
      providerId: "mock-wifi",
      providerAssurance: "SYNTHETIC_ONLY",
      updateMethod: "WIFI_OTA",
      updateCapabilityId: "mock-wifi-update",
    });
    expect(selection.status === "SELECTED" && selection.provider).toBe(wifi);
  });

  it("falls back to the next Target-supported method when needed", () => {
    const serial = provider("mock-serial", "UART");

    expect(
      selectFirmwareUpdateProvider({ target, providers: [serial] }),
    ).toMatchObject({
      status: "SELECTED",
      providerId: "mock-serial",
      updateMethod: "UART",
    });
  });

  it("blocks when no provider implements a Target-supported method", () => {
    expect(
      selectFirmwareUpdateProvider({
        target,
        providers: [provider("mock-dfu", "DFU")],
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "NO_SUPPORTED_UPDATE_METHOD_AVAILABLE",
    });
  });

  it("blocks an empty or ambiguous provider registry", () => {
    expect(selectFirmwareUpdateProvider({ target, providers: [] })).toEqual({
      status: "BLOCKED",
      reason: "NO_UPDATE_PROVIDER_REGISTERED",
    });
    expect(
      selectFirmwareUpdateProvider({
        target,
        providers: [
          provider("mock-wifi-browser", "WIFI_OTA"),
          provider("mock-wifi-native", "WIFI_OTA"),
        ],
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "AMBIGUOUS_UPDATE_METHOD_PROVIDER",
    });
  });

  it("rejects duplicate provider ids even when methods differ", () => {
    expect(
      selectFirmwareUpdateProvider({
        target,
        providers: [
          provider("duplicate-provider", "WIFI_OTA"),
          provider("duplicate-provider", "UART"),
        ],
      }),
    ).toEqual({
      status: "BLOCKED",
      reason: "INVALID_UPDATE_PROVIDER_REGISTRY",
    });
  });

  it("rejects any provider that claims an unadmitted real-write assurance", () => {
    const unadmitted = {
      ...provider("future-real-writer", "WIFI_OTA"),
      assurance: "REAL_WRITE_UNVERIFIED",
    } as unknown as FirmwareUpdateProvider;

    expect(
      selectFirmwareUpdateProvider({ target, providers: [unadmitted] }),
    ).toEqual({
      status: "BLOCKED",
      reason: "INVALID_UPDATE_PROVIDER_REGISTRY",
    });
  });

  it("never executes accessor-backed provider metadata", () => {
    let getterCalls = 0;
    const hostile = Object.create(null) as FirmwareUpdateProvider;
    Object.defineProperties(hostile, {
      id: { value: "hostile-provider", enumerable: true },
      assurance: { value: "SYNTHETIC_ONLY", enumerable: true },
      updateMethod: {
        enumerable: true,
        get() {
          getterCalls += 1;
          return "WIFI_OTA";
        },
      },
      updateCapabilityId: {
        value: "hostile-provider-update",
        enumerable: true,
      },
    });

    expect(
      selectFirmwareUpdateProvider({ target, providers: [hostile] }),
    ).toEqual({
      status: "BLOCKED",
      reason: "INVALID_UPDATE_PROVIDER_REGISTRY",
    });
    expect(getterCalls).toBe(0);
  });
});
