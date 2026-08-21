import type { TargetDefinition } from "@elrs-easy/compatibility";
import { rebuildProviderId } from "@elrs-easy/device";
import {
  isFirmwareUpdateMethod,
  type FirmwareUpdateMethod,
  type FirmwareUpdateProviderAssurance,
} from "@elrs-easy/domain";

import { readProviderDataProperty } from "./sensitive-operation-helpers.js";
import type { FirmwareUpdateProvider } from "./sensitive-operation-contracts.js";

export const firmwareUpdateProviderSelectionBlockReasons = [
  "NO_UPDATE_PROVIDER_REGISTERED",
  "NO_SUPPORTED_UPDATE_METHOD_AVAILABLE",
  "AMBIGUOUS_UPDATE_METHOD_PROVIDER",
  "INVALID_UPDATE_PROVIDER_REGISTRY",
] as const;

export type FirmwareUpdateProviderSelectionBlockReason =
  (typeof firmwareUpdateProviderSelectionBlockReasons)[number];

export type FirmwareUpdateProviderSelection =
  | {
      readonly status: "SELECTED";
      readonly provider: FirmwareUpdateProvider;
      readonly providerId: string;
      readonly providerAssurance: FirmwareUpdateProviderAssurance;
      readonly updateMethod: FirmwareUpdateMethod;
      readonly updateCapabilityId: string;
    }
  | {
      readonly status: "BLOCKED";
      readonly reason: FirmwareUpdateProviderSelectionBlockReason;
    };

interface InspectedProvider {
  readonly provider: FirmwareUpdateProvider;
  readonly providerId: string;
  readonly providerAssurance: FirmwareUpdateProviderAssurance;
  readonly updateMethod: FirmwareUpdateMethod;
  readonly updateCapabilityId: string;
}

function inspectProvider(
  provider: FirmwareUpdateProvider,
): InspectedProvider | null {
  try {
    const providerId = rebuildProviderId(
      readProviderDataProperty(provider, "id"),
    );
    const providerAssurance = readProviderDataProperty(provider, "assurance");
    const updateMethod = readProviderDataProperty(provider, "updateMethod");
    const updateCapabilityId = rebuildProviderId(
      readProviderDataProperty(provider, "updateCapabilityId"),
    );
    if (
      providerAssurance !== "SYNTHETIC_ONLY" ||
      !isFirmwareUpdateMethod(updateMethod)
    ) {
      return null;
    }
    return Object.freeze({
      provider,
      providerId,
      providerAssurance,
      updateMethod,
      updateCapabilityId,
    });
  } catch {
    return null;
  }
}

/**
 * Selects one platform provider using the target's ordered method preference.
 * Provider array order is never a preference signal. Multiple providers for
 * one preferred method are treated as ambiguous rather than guessed.
 */
export function selectFirmwareUpdateProvider(input: {
  readonly target: TargetDefinition;
  readonly providers: readonly FirmwareUpdateProvider[];
}): FirmwareUpdateProviderSelection {
  if (input.providers.length === 0) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "NO_UPDATE_PROVIDER_REGISTERED",
    });
  }

  const inspected = input.providers.map(inspectProvider);
  if (inspected.some((provider) => provider === null)) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "INVALID_UPDATE_PROVIDER_REGISTRY",
    });
  }

  const validProviders = inspected as readonly InspectedProvider[];
  const providerIds = validProviders.map((provider) => provider.providerId);
  if (new Set(providerIds).size !== providerIds.length) {
    return Object.freeze({
      status: "BLOCKED",
      reason: "INVALID_UPDATE_PROVIDER_REGISTRY",
    });
  }

  for (const method of input.target.updateMethods) {
    const candidates = validProviders.filter(
      (provider) => provider.updateMethod === method,
    );
    if (candidates.length > 1) {
      return Object.freeze({
        status: "BLOCKED",
        reason: "AMBIGUOUS_UPDATE_METHOD_PROVIDER",
      });
    }
    const selected = candidates[0];
    if (selected !== undefined) {
      return Object.freeze({
        status: "SELECTED",
        provider: selected.provider,
        providerId: selected.providerId,
        providerAssurance: selected.providerAssurance,
        updateMethod: selected.updateMethod,
        updateCapabilityId: selected.updateCapabilityId,
      });
    }
  }

  return Object.freeze({
    status: "BLOCKED",
    reason: "NO_SUPPORTED_UPDATE_METHOD_AVAILABLE",
  });
}
