/**
 * Confidentiality and authenticity for the exported recovery package.
 *
 * The package is not a neutral blob. Its `segments/firmware.bin` is the
 * *configured* image, and configuration is appended to the image as a plain
 * JSON block, so the archive carries — in cleartext, before this module — the
 * Wi-Fi SSID and password the operator typed and the 6-byte UID derived from
 * their binding phrase. The UID is `md5("-DMY_BINDING_PHRASE=\"…\"")[0..6]`,
 * which is upstream's derivation and therefore not negotiable; it is also
 * unsalted and truncated, so a weak phrase is recoverable from it offline by
 * dictionary search. Anyone holding the UID can bind to the link.
 *
 * That file is then written, by design, to storage the operator chooses and the
 * application does not own — Downloads, an SD card, a cloud folder. Durability
 * was the point; it also means the file is readable by every other application
 * on the device and syncable off it. So the same change that made recovery
 * survive an uninstall is the change that made a plaintext archive the wrong
 * thing to write.
 *
 * ## What this is
 *
 * A versioned envelope: PBKDF2-HMAC-SHA-256 over an operator passphrase with a
 * random per-file salt, then AES-256-GCM with a random per-file nonce. The
 * entire cleartext prefix — magic, version, algorithm identifiers, iteration
 * count, salt, nonce and the identity header — is passed as additional
 * authenticated data, so none of it can be edited without breaking
 * authentication. Every primitive here is WebCrypto, which the browser and the
 * Android WebView both implement; there is no native crypto path to keep in
 * step and no third-party dependency to audit.
 *
 * ## Why the GCM tag and not a hash
 *
 * The archive already contains a SHA-256 per segment in its own manifest, and
 * the durable receipt records a SHA-256 of the whole file. Neither is
 * authentication. Both are computed *from* the file, so anyone who edits the
 * file recomputes them: a hash beside mutable bytes proves only that the bytes
 * have not rotted. The GCM tag is keyed by a secret the file does not contain,
 * which is what makes forging it hard rather than clerical. `HASH_MISMATCH`
 * from the durable receipt and `AUTHENTICATION_FAILED` from here are different
 * claims and are reported separately.
 *
 * ## What stays readable
 *
 * The identity header is deliberately cleartext: target id, product name,
 * platform, firmware, release, and the device identity recorded at export. An
 * operator with three recovery files on a phone and a dead transmitter has to
 * be able to tell which file is which *before* typing a passphrase, and an
 * unidentifiable blob would make the feature worse at the one moment it
 * matters. None of it is secret — the target id and product name are printed on
 * the device and listed in a public catalog. It is authenticated, so it can be
 * trusted to be what the exporter wrote, and it is the only thing outside the
 * ciphertext.
 */
import { copyToArrayBuffer } from "./byte-utils";

/** Identifies the envelope and its version in the first bytes of the file. */
const VAULT_MAGIC = new Uint8Array([
  0x45, 0x4c, 0x52, 0x53, 0x52, 0x43, 0x56, 0x31,
]); // "ELRSRCV1"
const VAULT_FORMAT_VERSION = 1;
const KDF_PBKDF2_HMAC_SHA256 = 1;
const CIPHER_AES_256_GCM = 1;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
const FIXED_HEADER_BYTES = 24;

/**
 * The work factor written into new files.
 *
 * Measured, not guessed: 600,000 iterations of PBKDF2-HMAC-SHA-256 takes about
 * 293 ms on the CI runner this was benchmarked on (100k/49 ms, 210k/138 ms,
 * 600k/293 ms, 1M/466 ms). A mid-range phone runs this several times slower, so
 * budget one to two and a half seconds — paid once per export and once per
 * import, which is the right place to spend it. It matches the OWASP guidance
 * for this construction.
 */
export const VAULT_PBKDF2_ITERATIONS = 600_000;

/**
 * Bounds on an iteration count this build will *accept* from a file.
 *
 * The floor rejects a file claiming a work factor no honest exporter would
 * write. The ceiling is the more important one: the count is attacker-chosen
 * cleartext, and deriving a key with a four-billion-iteration header would hang
 * the interface. Refusing it by name is better than appearing to freeze.
 */
const MIN_ACCEPTED_ITERATIONS = 100_000;
const MAX_ACCEPTED_ITERATIONS = 4_000_000;

/** Bounds the envelope so a hostile file cannot ask for a huge allocation. */
const MAX_VAULT_BYTES = 96 * 1024 * 1024;
const MAX_IDENTITY_HEADER_BYTES = 16 * 1024;

/**
 * The shortest passphrase this will create a file with.
 *
 * Not a policy gesture: PBKDF2 buys a fixed multiplier against guessing, and
 * below roughly this length the multiplier stops mattering. Enforced on export
 * only — a file that already exists is opened with whatever created it.
 */
export const MIN_RECOVERY_PASSPHRASE_LENGTH = 8;

export type RecoveryVaultFailure =
  /** The file does not start with this envelope's magic. Probably a plain zip. */
  | "NOT_A_VAULT"
  /** Right magic, a version or algorithm this build does not implement. */
  | "UNSUPPORTED_FORMAT"
  /** Internally inconsistent lengths, or an identity header that is not JSON. */
  | "MALFORMED_HEADER"
  /** Shorter than its own header says it is. */
  | "TRUNCATED"
  /** Bytes past the end of the declared ciphertext. */
  | "TRAILING_DATA"
  /** Outside the accepted size range, or an implausible work factor. */
  | "TOO_LARGE"
  /**
   * The tag did not verify. A wrong passphrase and a tampered file are the
   * same event to AES-GCM and are reported as one, because claiming to tell
   * them apart would be a lie: the tag is a function of both.
   */
  | "AUTHENTICATION_FAILED"
  /** No passphrase was supplied, or it is too short to create a file with. */
  | "PASSPHRASE_UNUSABLE";

export class RecoveryVaultError extends Error {
  public constructor(
    public readonly code: RecoveryVaultFailure,
    message: string,
  ) {
    super(message);
    this.name = "RecoveryVaultError";
  }
}

/**
 * What the file says about itself before anything is decrypted.
 *
 * Authenticated as associated data, so a mismatch between this and the
 * ciphertext is a failure rather than a silent substitution. Shown to the
 * operator so they can identify a file they saved months ago.
 */
export interface RecoveryVaultIdentity {
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly target: {
    readonly id: string;
    readonly productName: string;
    readonly platform: string;
    readonly firmware: string;
  };
  readonly release: { readonly label: string; readonly revision: string };
  readonly device: {
    readonly productName: string | null;
    readonly role: string | null;
    readonly firmwareVersion: string | null;
  };
}

export interface RecoveryVaultHeader {
  readonly formatVersion: number;
  readonly iterations: number;
  readonly identity: RecoveryVaultIdentity;
  /** Where the ciphertext starts, and how long it is. */
  readonly ciphertextOffset: number;
  readonly ciphertextLength: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, maximum = 240): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

function optionalText(value: unknown, maximum = 240): string | null {
  return value === null ? null : safeText(value, maximum);
}

/**
 * Overwrites a buffer we are done with.
 *
 * Best effort and honestly so: a `Uint8Array` we own can be zeroed, but the
 * JavaScript string the operator typed cannot be — strings are immutable and
 * the engine may have copied it. This narrows the window in which a heap dump
 * is interesting; it does not close it. Nothing here is ever logged, which is
 * the part that actually holds.
 */
function wipe(...buffers: readonly (Uint8Array | null | undefined)[]): void {
  for (const buffer of buffers) buffer?.fill(0);
}

async function deriveVaultKey(input: {
  readonly passphrase: string;
  readonly salt: Uint8Array;
  readonly iterations: number;
}): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(input.passphrase.normalize("NFC"));
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      copyToArrayBuffer(encoded),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: copyToArrayBuffer(input.salt),
        iterations: input.iterations,
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    wipe(encoded);
  }
}

function encodeIdentity(identity: RecoveryVaultIdentity): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(identity));
  if (json.byteLength > MAX_IDENTITY_HEADER_BYTES) {
    throw new RecoveryVaultError(
      "MALFORMED_HEADER",
      "Recovery identity header is larger than the format allows",
    );
  }
  return json;
}

/**
 * Builds the cleartext prefix, which is also the additional authenticated data.
 *
 * One function so that writing and reading cannot disagree about which bytes
 * are covered — a mismatch there would either fail every file or authenticate
 * none of the header, and both have been shipped by other people.
 */
function buildPrefix(input: {
  readonly iterations: number;
  readonly salt: Uint8Array;
  readonly nonce: Uint8Array;
  readonly identityJson: Uint8Array;
  readonly ciphertextLength: number;
}): Uint8Array {
  const prefix = new Uint8Array(
    FIXED_HEADER_BYTES +
      input.salt.byteLength +
      input.nonce.byteLength +
      input.identityJson.byteLength,
  );
  prefix.set(VAULT_MAGIC, 0);
  const view = new DataView(
    prefix.buffer,
    prefix.byteOffset,
    prefix.byteLength,
  );
  view.setUint16(8, VAULT_FORMAT_VERSION, true);
  prefix[10] = KDF_PBKDF2_HMAC_SHA256;
  prefix[11] = CIPHER_AES_256_GCM;
  view.setUint32(12, input.iterations, true);
  prefix[16] = input.salt.byteLength;
  prefix[17] = input.nonce.byteLength;
  view.setUint16(18, input.identityJson.byteLength, true);
  view.setUint32(20, input.ciphertextLength, true);
  let offset = FIXED_HEADER_BYTES;
  prefix.set(input.salt, offset);
  offset += input.salt.byteLength;
  prefix.set(input.nonce, offset);
  offset += input.nonce.byteLength;
  prefix.set(input.identityJson, offset);
  return prefix;
}

/**
 * Seals the archive.
 *
 * The passphrase is used and dropped; it is never returned, stored, or written
 * into the file in any form, including a verifier. The consequence is stated
 * plainly in the interface and the documentation: a forgotten passphrase means
 * an unrecoverable file, and that is the cost of the file being safe to leave
 * in Downloads.
 */
export async function sealRecoveryVault(input: {
  readonly archive: Uint8Array;
  readonly identity: RecoveryVaultIdentity;
  readonly passphrase: string;
  readonly iterations?: number;
}): Promise<Uint8Array> {
  if (
    input.passphrase.normalize("NFC").length < MIN_RECOVERY_PASSPHRASE_LENGTH
  ) {
    throw new RecoveryVaultError(
      "PASSPHRASE_UNUSABLE",
      `A recovery passphrase must be at least ${String(MIN_RECOVERY_PASSPHRASE_LENGTH)} characters`,
    );
  }
  if (
    input.archive.byteLength === 0 ||
    input.archive.byteLength > MAX_VAULT_BYTES
  ) {
    throw new RecoveryVaultError(
      "TOO_LARGE",
      "Recovery archive is outside the size this envelope carries",
    );
  }
  const iterations = input.iterations ?? VAULT_PBKDF2_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const identityJson = encodeIdentity(input.identity);
  const prefix = buildPrefix({
    iterations,
    salt,
    nonce,
    identityJson,
    ciphertextLength: input.archive.byteLength + GCM_TAG_BYTES,
  });

  const key = await deriveVaultKey({
    passphrase: input.passphrase,
    salt,
    iterations,
  });
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: copyToArrayBuffer(nonce),
        additionalData: copyToArrayBuffer(prefix),
        tagLength: GCM_TAG_BYTES * 8,
      },
      key,
      copyToArrayBuffer(input.archive),
    ),
  );
  const file = new Uint8Array(prefix.byteLength + sealed.byteLength);
  file.set(prefix, 0);
  file.set(sealed, prefix.byteLength);
  wipe(sealed);
  return file;
}

/**
 * Reads the cleartext header without the passphrase, and refuses anything
 * inconsistent before a key is derived.
 *
 * Order is deliberate. Every structural check happens here, so an operator
 * pointing at the wrong file learns that immediately rather than after waiting
 * for 600,000 iterations of PBKDF2, and a hostile file cannot use the
 * iteration count as a denial of service.
 */
export function readRecoveryVaultHeader(
  bytes: Uint8Array,
): RecoveryVaultHeader {
  if (bytes.byteLength > MAX_VAULT_BYTES) {
    throw new RecoveryVaultError(
      "TOO_LARGE",
      "Recovery file is larger than this build will open",
    );
  }
  if (bytes.byteLength < FIXED_HEADER_BYTES) {
    throw new RecoveryVaultError(
      "NOT_A_VAULT",
      "File is too short to be an encrypted recovery package",
    );
  }
  for (let index = 0; index < VAULT_MAGIC.length; index += 1) {
    if (bytes[index] !== VAULT_MAGIC[index]) {
      throw new RecoveryVaultError(
        "NOT_A_VAULT",
        "File is not an encrypted recovery package",
      );
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const formatVersion = view.getUint16(8, true);
  const kdfId = bytes[10];
  const cipherId = bytes[11];
  if (
    formatVersion !== VAULT_FORMAT_VERSION ||
    kdfId !== KDF_PBKDF2_HMAC_SHA256 ||
    cipherId !== CIPHER_AES_256_GCM
  ) {
    throw new RecoveryVaultError(
      "UNSUPPORTED_FORMAT",
      `This build cannot open recovery format version ${String(formatVersion)}`,
    );
  }
  const iterations = view.getUint32(12, true);
  const saltLength = bytes[16] ?? 0;
  const nonceLength = bytes[17] ?? 0;
  const identityLength = view.getUint16(18, true);
  const ciphertextLength = view.getUint32(20, true);
  if (
    iterations < MIN_ACCEPTED_ITERATIONS ||
    iterations > MAX_ACCEPTED_ITERATIONS
  ) {
    throw new RecoveryVaultError(
      "TOO_LARGE",
      `Recovery file declares an unusable work factor of ${String(iterations)}`,
    );
  }
  if (
    saltLength !== SALT_BYTES ||
    nonceLength !== NONCE_BYTES ||
    identityLength === 0 ||
    identityLength > MAX_IDENTITY_HEADER_BYTES ||
    ciphertextLength <= GCM_TAG_BYTES
  ) {
    throw new RecoveryVaultError(
      "MALFORMED_HEADER",
      "Recovery file header is inconsistent",
    );
  }
  const ciphertextOffset =
    FIXED_HEADER_BYTES + saltLength + nonceLength + identityLength;
  const declaredEnd = ciphertextOffset + ciphertextLength;
  if (bytes.byteLength < declaredEnd) {
    throw new RecoveryVaultError(
      "TRUNCATED",
      "Recovery file is shorter than its own header describes",
    );
  }
  if (bytes.byteLength > declaredEnd) {
    // Not tolerated. Appended bytes are outside the authenticated range, so
    // accepting them would mean accepting a file whose tail nothing verifies.
    throw new RecoveryVaultError(
      "TRAILING_DATA",
      `Recovery file carries ${String(bytes.byteLength - declaredEnd)} unexpected bytes after its payload`,
    );
  }

  const identityStart = FIXED_HEADER_BYTES + saltLength + nonceLength;
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(identityStart, identityStart + identityLength),
      ),
    );
  } catch {
    throw new RecoveryVaultError(
      "MALFORMED_HEADER",
      "Recovery identity header is not valid JSON",
    );
  }
  return Object.freeze({
    formatVersion,
    iterations,
    identity: parseIdentity(parsed),
    ciphertextOffset,
    ciphertextLength,
  });
}

function parseIdentity(parsed: unknown): RecoveryVaultIdentity {
  const target =
    isRecord(parsed) && isRecord(parsed.target) ? parsed.target : null;
  const release =
    isRecord(parsed) && isRecord(parsed.release) ? parsed.release : null;
  const device =
    isRecord(parsed) && isRecord(parsed.device) ? parsed.device : null;
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    target === null ||
    release === null ||
    device === null
  ) {
    throw new RecoveryVaultError(
      "MALFORMED_HEADER",
      "Recovery identity header does not match the supported schema",
    );
  }
  const createdAt = safeText(parsed.createdAt, 64);
  const targetId = safeText(target.id);
  const productName = safeText(target.productName);
  const platform = safeText(target.platform, 64);
  const firmware = safeText(target.firmware, 120);
  const label = safeText(release.label, 64);
  const revision = safeText(release.revision, 64);
  if (
    createdAt === null ||
    targetId === null ||
    productName === null ||
    platform === null ||
    firmware === null ||
    label === null ||
    revision === null
  ) {
    throw new RecoveryVaultError(
      "MALFORMED_HEADER",
      "Recovery identity header is missing required fields",
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    createdAt,
    target: Object.freeze({ id: targetId, productName, platform, firmware }),
    release: Object.freeze({ label, revision }),
    device: Object.freeze({
      productName: optionalText(device.productName),
      role: optionalText(device.role, 16),
      firmwareVersion: optionalText(device.firmwareVersion, 64),
    }),
  });
}

/**
 * Opens the envelope, or fails without having produced anything.
 *
 * There is no partial success. `crypto.subtle.decrypt` verifies the tag before
 * it returns plaintext, so a failure here yields no bytes to act on — the
 * caller never sees a half-parsed archive, and cannot be tempted to write one
 * to a device. The structural header read happens first and separately, so the
 * failure an operator is shown distinguishes "this is the wrong file" from
 * "this file will not authenticate".
 */
export async function openRecoveryVault(input: {
  readonly bytes: Uint8Array;
  readonly passphrase: string;
}): Promise<{
  readonly header: RecoveryVaultHeader;
  readonly archive: Uint8Array;
}> {
  const header = readRecoveryVaultHeader(input.bytes);
  if (input.passphrase.length === 0) {
    throw new RecoveryVaultError(
      "PASSPHRASE_UNUSABLE",
      "A recovery passphrase is required to open this file",
    );
  }
  const salt = input.bytes.subarray(
    FIXED_HEADER_BYTES,
    FIXED_HEADER_BYTES + SALT_BYTES,
  );
  const nonce = input.bytes.subarray(
    FIXED_HEADER_BYTES + SALT_BYTES,
    FIXED_HEADER_BYTES + SALT_BYTES + NONCE_BYTES,
  );
  const prefix = input.bytes.subarray(0, header.ciphertextOffset);
  const ciphertext = input.bytes.subarray(
    header.ciphertextOffset,
    header.ciphertextOffset + header.ciphertextLength,
  );
  const key = await deriveVaultKey({
    passphrase: input.passphrase,
    salt,
    iterations: header.iterations,
  });
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: copyToArrayBuffer(nonce),
        additionalData: copyToArrayBuffer(prefix),
        tagLength: GCM_TAG_BYTES * 8,
      },
      key,
      copyToArrayBuffer(ciphertext),
    );
  } catch {
    // Deliberately one code for both causes, and deliberately no detail: the
    // error must not become an oracle about which byte was wrong.
    throw new RecoveryVaultError(
      "AUTHENTICATION_FAILED",
      "The recovery passphrase is wrong, or this file has been modified since it was saved",
    );
  }
  return Object.freeze({ header, archive: new Uint8Array(plaintext) });
}

/** True when these bytes begin with this envelope's magic. */
export function looksLikeRecoveryVault(bytes: Uint8Array): boolean {
  if (bytes.byteLength < VAULT_MAGIC.length) return false;
  for (let index = 0; index < VAULT_MAGIC.length; index += 1) {
    if (bytes[index] !== VAULT_MAGIC[index]) return false;
  }
  return true;
}
