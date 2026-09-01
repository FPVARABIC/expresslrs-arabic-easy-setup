from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def matching_brace(text: str, opening: int) -> int:
    depth = 1
    state = "code"
    quote = ""
    index = opening + 1
    while index < len(text):
        char = text[index]
        following = text[index + 1] if index + 1 < len(text) else ""
        if state == "code":
            if char in {'\"', "'", "`"}:
                state = "string"
                quote = char
            elif char == "/" and following == "/":
                state = "line"
                index += 1
            elif char == "/" and following == "*":
                state = "block"
                index += 1
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return index
        elif state == "string":
            if char == "\\":
                index += 1
            elif char == quote:
                state = "code"
        elif state == "line":
            if char == "\n":
                state = "code"
        elif state == "block" and char == "*" and following == "/":
            state = "code"
            index += 1
        index += 1
    raise RuntimeError("Unbalanced source")


def optimize_parser() -> None:
    path = "apps/web/src/hardware/crsf.ts"
    source = read(path)
    marker = "  public push(chunk: Uint8Array): readonly CrsfFrame[] {"
    start = source.find(marker)
    if start < 0:
        raise RuntimeError("CRSF parser push method not found")
    opening = source.find("{", start)
    end = matching_brace(source, opening) + 1
    replacement = '''  public push(chunk: Uint8Array): readonly CrsfFrame[] {
    if (chunk.byteLength === 0) {
      return Object.freeze([]);
    }
    if (chunk.byteLength > CRSF_MAX_INPUT_CHUNK_SIZE) {
      throw new RangeError(
        `CRSF input chunk exceeds ${CRSF_MAX_INPUT_CHUNK_SIZE} bytes`,
      );
    }

    const buffer = concatBytes(this.#buffer, chunk);
    const frames: CrsfFrame[] = [];
    let cursor = 0;

    while (buffer.byteLength - cursor >= 4) {
      const address = buffer[cursor];
      if (address === undefined || !isPlausibleAddress(address)) {
        cursor += 1;
        continue;
      }
      const frameSize = buffer[cursor + 1] ?? 0;
      const totalSize = frameSize + 2;
      if (frameSize < 2 || totalSize > CRSF_MAX_FRAME_SIZE) {
        cursor += 1;
        continue;
      }
      if (buffer.byteLength - cursor < totalSize) {
        break;
      }

      const raw = buffer.slice(cursor, cursor + totalSize);
      const typeAndPayload = raw.slice(2, totalSize - 1);
      const expectedCrc = raw[totalSize - 1];
      if (
        expectedCrc === undefined ||
        crc8DvbS2(typeAndPayload) !== expectedCrc
      ) {
        cursor += 1;
        continue;
      }

      const type = raw[2];
      if (type === undefined) {
        cursor += 1;
        continue;
      }
      frames.push(
        Object.freeze({
          address,
          frameSize,
          type,
          payload: raw.slice(3, totalSize - 1),
          raw,
        }),
      );
      cursor += totalSize;
    }

    this.#buffer = buffer.slice(cursor);
    return Object.freeze(frames);
  }'''
    write(path, source[:start] + replacement + source[end:])


def make_close_retryable() -> None:
    path = "apps/web/src/hardware/serial.ts"
    source = read(path)
    old = '''    this.#portCloseTask = (async () => {
      try {
        await this.#port.close();
        this.#portClosed = true;
        return true;
      } catch {
        return false;
      }
    })();
    return this.#portCloseTask;'''
    new = '''    const closeTask = (async () => {
      try {
        await this.#port.close();
        this.#portClosed = true;
        return true;
      } catch {
        return false;
      }
    })();
    this.#portCloseTask = closeTask;
    const closed = await closeTask;
    if (!closed && this.#portCloseTask === closeTask) {
      this.#portCloseTask = null;
    }
    return closed;'''
    if old not in source:
        if "const closeTask = (async () =>" in source:
            return
        raise RuntimeError("Retryable serial close insertion point not found")
    write(path, source.replace(old, new, 1))


def strengthen_static_gate() -> None:
    path = "scripts/check-hardware-user-journey.mjs"
    source = read(path)
    if "quadratic byte-by-byte buffer copying" in source:
        return
    marker = 'requireInvariant(/CRSF_MAX_INPUT_CHUNK_SIZE/u.test(crsf), "CRSF input chunks must be bounded before allocation.");\n'
    addition = '''requireInvariant(
  /let cursor = 0/u.test(crsf) &&
    !/this\\.#buffer = this\\.#buffer\\.slice\\(1\\)/u.test(crsf),
  "CRSF resynchronization must not use quadratic byte-by-byte buffer copying.",
);
'''
    if marker not in source:
        raise RuntimeError("Hardware journey gate insertion point not found")
    write(path, source.replace(marker, marker + addition, 1))


def add_tests() -> None:
    write(
        "apps/web/src/hardware/protocol-resource-regressions.test.ts",
        r'''import { describe, expect, it, vi } from "vitest";

import {
  CRSF_MAX_INPUT_CHUNK_SIZE,
  CrsfStreamParser,
  concatBytes,
  createDevicePing,
} from "./crsf";
import {
  CrsfSerialLink,
  type HardwareSerialPort,
  type HardwareSerialReader,
  type HardwareSerialWriter,
} from "./serial";

function pendingPort() {
  let finishRead:
    | ((value: Readonly<{ done: boolean; value?: Uint8Array }>) => void)
    | undefined;
  const reader: HardwareSerialReader = {
    read: () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    cancel: async () => finishRead?.({ done: true }),
    releaseLock: vi.fn(),
  };
  const writer: HardwareSerialWriter = {
    write: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  };
  const close = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("port still busy"))
    .mockResolvedValue(undefined);
  const port: HardwareSerialPort = {
    readable: { getReader: () => reader },
    writable: { getWriter: () => writer },
    open: vi.fn().mockResolvedValue(undefined),
    close,
  };
  return { port, reader, writer, close };
}

describe("CRSF protocol resource regressions", () => {
  it("resynchronizes after the largest accepted noise chunk and still parses the next valid frame", () => {
    const parser = new CrsfStreamParser();
    const noise = new Uint8Array(CRSF_MAX_INPUT_CHUNK_SIZE);
    noise.fill(0x41);
    const frame = createDevicePing();

    const parsed = parser.push(concatBytes(noise, frame));

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.raw).toEqual(frame);
  });

  it("allows the user to retry closing a browser port after a transient close failure", async () => {
    const { port, reader, writer, close } = pendingPort();
    const link = new CrsfSerialLink(port);
    link.start();

    await expect(link.close()).resolves.toBe(false);
    await expect(link.close()).resolves.toBe(true);

    expect(close).toHaveBeenCalledTimes(2);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(writer.releaseLock).toHaveBeenCalledTimes(1);
  });
});
''',
    )


optimize_parser()
make_close_retryable()
strengthen_static_gate()
add_tests()
