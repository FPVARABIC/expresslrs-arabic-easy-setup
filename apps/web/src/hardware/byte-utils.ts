/**
 * Creates an owned ArrayBuffer-backed copy of bytes.
 *
 * TypeScript 6 models typed arrays as potentially backed by SharedArrayBuffer.
 * Browser APIs such as Web Crypto, Blob, Response, and WebUSB require an
 * ArrayBuffer-backed view. Copying at the trust boundary keeps those calls
 * portable and prevents later mutation of the caller's buffer.
 */
export function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function copyToUint8Array(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(copyToArrayBuffer(bytes));
}

export function isAbortRequested(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}
