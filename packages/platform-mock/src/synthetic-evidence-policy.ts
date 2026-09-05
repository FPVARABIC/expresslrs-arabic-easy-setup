import type {
  DiscoveryProvider,
  IdentityEvidenceTrustPolicy,
} from "@elrs-easy/device";

/**
 * Test-only authority mapping. Trust comes from this reviewed fixture policy,
 * never from strength/reliability/trustDomain fields returned by a provider.
 */
export function createSyntheticIdentityEvidencePolicy(
  provider: DiscoveryProvider,
): IdentityEvidenceTrustPolicy {
  const policy: IdentityEvidenceTrustPolicy = {
    classify(input) {
      if (input.provider !== provider) {
        return null;
      }
      if (input.reportedSourceKind === "synthetic-bootloader") {
        return Object.freeze({
          sourceKind: "synthetic-bootloader",
          sourceInstanceId: "bootloader-reader",
          trustDomain: "bootloader",
          strength: input.claim === "target" ? "TARGET_SPECIFIC" : "SUPPORTING",
          reliability: "VALIDATED",
        });
      }
      if (input.reportedSourceKind === "synthetic-runtime-config") {
        const strength =
          input.claim === "target"
            ? "TARGET_SPECIFIC"
            : input.claim === "mcu-family"
              ? "GENERIC"
              : "SUPPORTING";
        return Object.freeze({
          sourceKind: "synthetic-runtime-config",
          sourceInstanceId: "runtime-reader",
          trustDomain: "runtime-firmware",
          strength,
          reliability: "VALIDATED",
        });
      }
      return null;
    },
  };
  return Object.freeze(policy);
}
