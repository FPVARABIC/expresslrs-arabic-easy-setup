import manifest from "./manifest.json";
import { packLayouts, packLogosBase64, packTargetsJson } from "./pack-data";

/**
 * The release-scoped target pack.
 *
 * ExpressLRS 4.1.0 records no ExpressLRS/Targets commit — its release workflow
 * checks that repository out with no `ref`, so the release consumed an
 * unrecorded default-branch tip. The published mirror then serves one mutable
 * `hardware/` tree that keeps moving afterwards.
 *
 * Packaging a pinned firmware release against a layout fetched from that
 * moving tree makes the bytes written to a device depend on when the write
 * happened. Recovery makes that intolerable: the image restored has to be the
 * image saved. So the layouts and the catalog are frozen here from an
 * immutable commit, hashed, and compiled into the build — nothing on the write
 * path is fetched from a mutable location, and the pack works offline because
 * it never leaves the bundle.
 *
 * This pack is **not** a reconstruction of what 4.1.0 shipped with. It cannot
 * be: upstream did not record that. It is a snapshot this project validated,
 * carrying its own version, and it says so in `manifest.provenance`.
 */

export interface TargetPackManifest {
  readonly schemaVersion: 1;
  readonly packVersion: number;
  readonly createdAt: string;
  readonly provenance: {
    readonly claim: "NOT_THE_RELEASE_SNAPSHOT";
    readonly reason: string;
  };
  readonly validatedReleases: readonly {
    readonly label: string;
    readonly sha: string | null;
  }[];
  readonly validation: string;
  readonly targetsRepository: {
    readonly repository: string;
    readonly sha: string;
  };
  readonly targetsJsonSha256: string;
  readonly targetsJsonBytes: number;
  readonly layoutArchiveSha256: string;
  readonly layoutFileCount: number;
  readonly layoutSha256: Readonly<Record<string, string>>;
  readonly logoArchiveSha256: string;
  readonly logoFileCount: number;
  readonly logoSha256: Readonly<Record<string, string>>;
}

export type TargetPackIntegrityReason =
  /** The bundled catalog does not hash to what the manifest records. */
  | "TARGETS_JSON_DIGEST_MISMATCH"
  /** One layout does not hash to what the manifest records. */
  | "LAYOUT_DIGEST_MISMATCH"
  /** A layout the manifest lists is not present in the pack. */
  | "LAYOUT_MISSING"
  /** A layout is present that the manifest does not account for. */
  | "LAYOUT_UNEXPECTED"
  /** The set of layouts does not hash to the recorded archive digest. */
  | "LAYOUT_ARCHIVE_DIGEST_MISMATCH"
  /** The requested layout is not in this pack at all. */
  | "LAYOUT_NOT_IN_PACK"
  /** One logo does not hash to what the manifest records. */
  | "LOGO_DIGEST_MISMATCH"
  /** The pinned Targets commit is not the one this pack was built from. */
  | "TARGETS_SHA_MISMATCH"
  /** No validated pack exists for the firmware release being packaged. */
  | "RELEASE_NOT_IN_PACK";

export class TargetPackIntegrityError extends Error {
  public constructor(
    public readonly reason: TargetPackIntegrityReason,
    message: string,
  ) {
    super(message);
    this.name = "TargetPackIntegrityError";
  }
}

export const targetPackManifest: TargetPackManifest =
  manifest as TargetPackManifest;

function decodeLogo(name: string): Uint8Array<ArrayBuffer> | null {
  const encoded = packLogosBase64[name];
  if (encoded === undefined) return null;
  const binary = atob(encoded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Bytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The archive digest the generator computes: name, NUL, bytes, NUL, in order. */
async function archiveDigest(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const name of Object.keys(files).sort()) {
    parts.push(encoder.encode(name), encoder.encode("\0"));
    parts.push(encoder.encode(files[name] ?? ""), encoder.encode("\0"));
  }
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  const digest = await crypto.subtle.digest("SHA-256", joined);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

let verified: Promise<void> | null = null;

/**
 * Verifies the whole pack against its manifest. Runs once per session and is
 * awaited before any layout is handed out.
 *
 * There is deliberately no fallback. A pack that fails verification produces an
 * integrity error and the operation stops; quietly reaching for the live mirror
 * instead would reintroduce exactly the nondeterminism this exists to remove.
 */
export function verifyTargetPack(
  source: {
    readonly targetsJson?: string;
    readonly layouts?: Readonly<Record<string, string>>;
  } = {},
): Promise<void> {
  const targetsJson = source.targetsJson ?? packTargetsJson;
  const layouts = source.layouts ?? packLayouts;
  const run = async (): Promise<void> => {
    const catalogDigest = await sha256Hex(targetsJson);
    if (catalogDigest !== targetPackManifest.targetsJsonSha256) {
      throw new TargetPackIntegrityError(
        "TARGETS_JSON_DIGEST_MISMATCH",
        `The bundled target catalog hashes to ${catalogDigest}, but pack ${targetPackManifest.packVersion} records ${targetPackManifest.targetsJsonSha256}`,
      );
    }
    const expected = targetPackManifest.layoutSha256;
    for (const name of Object.keys(expected)) {
      const text = layouts[name];
      if (text === undefined) {
        throw new TargetPackIntegrityError(
          "LAYOUT_MISSING",
          `Pack ${targetPackManifest.packVersion} records ${name}, but it is not present`,
        );
      }
      const digest = await sha256Hex(text);
      if (digest !== expected[name]) {
        throw new TargetPackIntegrityError(
          "LAYOUT_DIGEST_MISMATCH",
          `${name} hashes to ${digest}, but pack ${targetPackManifest.packVersion} records ${expected[name]}`,
        );
      }
    }
    for (const name of Object.keys(layouts)) {
      if (!(name in expected)) {
        throw new TargetPackIntegrityError(
          "LAYOUT_UNEXPECTED",
          `${name} is present but pack ${targetPackManifest.packVersion} does not account for it`,
        );
      }
    }
    for (const [name, expectedDigest] of Object.entries(
      targetPackManifest.logoSha256,
    )) {
      const bytes = decodeLogo(name);
      if (bytes === null) {
        throw new TargetPackIntegrityError(
          "LAYOUT_MISSING",
          `Pack ${targetPackManifest.packVersion} records logo ${name}, but it is not present`,
        );
      }
      const digest = await sha256Bytes(bytes);
      if (digest !== expectedDigest) {
        throw new TargetPackIntegrityError(
          "LOGO_DIGEST_MISMATCH",
          `Logo ${name} hashes to ${digest}, but pack ${targetPackManifest.packVersion} records ${expectedDigest}`,
        );
      }
    }
    const archive = await archiveDigest(layouts);
    if (archive !== targetPackManifest.layoutArchiveSha256) {
      throw new TargetPackIntegrityError(
        "LAYOUT_ARCHIVE_DIGEST_MISMATCH",
        `The layout set hashes to ${archive}, but pack ${targetPackManifest.packVersion} records ${targetPackManifest.layoutArchiveSha256}`,
      );
    }
  };
  if (source.targetsJson !== undefined || source.layouts !== undefined) {
    // An explicit source is a test or a re-check, and is never memoised.
    return run();
  }
  verified ??= run();
  return verified;
}

/** For tests that need a clean verification state. */
export function resetTargetPackVerification(): void {
  verified = null;
}

/** The frozen catalog text, verified before it is returned. */
export async function targetPackCatalogJson(): Promise<string> {
  await verifyTargetPack();
  return packTargetsJson;
}

/**
 * One layout's exact bytes, verified before they are returned.
 *
 * `role` is the directory upstream reads from, which stays `RX` for a receiver
 * even when transmitter firmware is being written to it.
 */
export async function targetPackLayout(
  role: "RX" | "TX",
  layoutFile: string,
): Promise<string> {
  await verifyTargetPack();
  const key = `${role}/${layoutFile}`;
  const text = packLayouts[key];
  if (text === undefined) {
    throw new TargetPackIntegrityError(
      "LAYOUT_NOT_IN_PACK",
      `${key} is not in validated pack ${targetPackManifest.packVersion} (ExpressLRS/targets ${targetPackManifest.targetsRepository.sha}). This Target is newer than the pack; it stays visible, but it cannot be packaged until a new pack is validated.`,
    );
  }
  return text;
}

/** One logo's exact bytes from the pack, or null when the pack has none. */
export async function targetPackLogo(
  logoFile: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  await verifyTargetPack();
  return decodeLogo(logoFile);
}

/** Whether the pack can package this Target at all, for a UI that must explain. */
export function targetPackCovers(
  role: "RX" | "TX",
  layoutFile: string | null,
): boolean {
  if (layoutFile === null) return true;
  return `${role}/${layoutFile}` in packLayouts;
}

/**
 * Refuses a firmware release this pack has not been validated against.
 *
 * Upstream publishes one hardware tree for every release, so a Targets snapshot
 * is not inherently tied to a single firmware version. What *is* tied is which
 * releases this project has exercised the snapshot with. Anything else is
 * refused rather than assumed compatible — that assumption is precisely the
 * nondeterminism the pack removes.
 *
 * This is a live, resolvable condition, not a lock: validating a pack for the
 * release makes it work, and the message says so.
 */
export function assertPackMatchesRelease(releaseLabel: string): void {
  const validated = targetPackManifest.validatedReleases.some(
    (release) => release.label === releaseLabel,
  );
  if (!validated) {
    const known = targetPackManifest.validatedReleases
      .map((release) => release.label)
      .join(", ");
    throw new TargetPackIntegrityError(
      "RELEASE_NOT_IN_PACK",
      `No validated target pack covers ExpressLRS ${releaseLabel}. Pack ${targetPackManifest.packVersion} (ExpressLRS/targets ${targetPackManifest.targetsRepository.sha}) is validated for: ${known}. Validate a pack for ${releaseLabel} to package it.`,
    );
  }
}

/** Refuses a Targets commit other than the one this pack was built from. */
export function assertPackMatchesTargetsSha(sha: string): void {
  if (sha !== targetPackManifest.targetsRepository.sha) {
    throw new TargetPackIntegrityError(
      "TARGETS_SHA_MISMATCH",
      `Pack ${targetPackManifest.packVersion} was built from ExpressLRS/targets ${targetPackManifest.targetsRepository.sha}, not ${sha}`,
    );
  }
}
