export const localNetworkPermissionStates = [
  "GRANTED",
  "PROMPT",
  "DENIED",
  "UNAVAILABLE",
  "UNKNOWN",
] as const;

export type LocalNetworkPermissionState =
  (typeof localNetworkPermissionStates)[number];

export interface BrowserPermissionQueryPort {
  query(descriptor: { readonly name: string }): Promise<unknown>;
}

export interface LocalNetworkPermissionAssessmentInput {
  readonly permissions?: BrowserPermissionQueryPort | null;
  readonly secureContext?: boolean;
}

function browserPermissions(): BrowserPermissionQueryPort | null {
  if (typeof navigator === "undefined" || navigator.permissions === undefined) {
    return null;
  }
  return navigator.permissions as BrowserPermissionQueryPort;
}

function browserSecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true;
}

function readPermissionState(value: unknown): LocalNetworkPermissionState {
  if (typeof value !== "object" || value === null) {
    return "UNKNOWN";
  }
  let state: unknown;
  try {
    // PermissionStatus is a browser control object. Its state may live on the
    // prototype, so reading the standardized property is intentional here.
    state = (value as { readonly state?: unknown }).state;
  } catch {
    return "UNKNOWN";
  }
  switch (state) {
    case "granted":
      return "GRANTED";
    case "prompt":
      return "PROMPT";
    case "denied":
      return "DENIED";
    default:
      return "UNKNOWN";
  }
}

/**
 * Queries only existing browser permission state. It never calls a request or
 * chooser API and therefore cannot itself grant access. Chrome has used both a
 * current local-network descriptor and an earlier local-network-access alias;
 * unsupported descriptors are ignored fail-open-to-fetch so older browsers do
 * not become false negatives.
 */
export async function assessLocalNetworkPermission(
  input: LocalNetworkPermissionAssessmentInput = {},
): Promise<LocalNetworkPermissionState> {
  const permissions = input.permissions ?? browserPermissions();
  const secureContext = input.secureContext ?? browserSecureContext();
  if (!secureContext || permissions === null) {
    return "UNAVAILABLE";
  }

  let observedUnknown = false;
  for (const name of ["local-network", "local-network-access"] as const) {
    try {
      const status = await permissions.query({ name });
      const state = readPermissionState(status);
      if (state === "GRANTED" || state === "PROMPT" || state === "DENIED") {
        return state;
      }
      observedUnknown = true;
    } catch {
      // Descriptor not supported or host rejected the query. Try the reviewed
      // compatibility alias, then fall back to the actual fetch path.
    }
  }
  return observedUnknown ? "UNKNOWN" : "UNAVAILABLE";
}
