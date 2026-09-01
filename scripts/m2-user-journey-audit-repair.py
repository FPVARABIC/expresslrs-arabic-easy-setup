from __future__ import annotations

import json
import re
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
    i = opening + 1
    state = "code"
    quote = ""
    while i < len(text):
        char = text[i]
        following = text[i + 1] if i + 1 < len(text) else ""
        if state == "code":
            if char in {'\"', "'", "`"}:
                state = "string"
                quote = char
            elif char == "/" and following == "/":
                state = "line"
                i += 1
            elif char == "/" and following == "*":
                state = "block"
                i += 1
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return i
        elif state == "string":
            if char == "\\":
                i += 1
            elif char == quote:
                state = "code"
        elif state == "line":
            if char == "\n":
                state = "code"
        elif state == "block" and char == "*" and following == "/":
            state = "code"
            i += 1
        i += 1
    raise RuntimeError("Unbalanced source block")


def patch_component() -> None:
    path = "apps/web/src/components/DeviceConnectionHub.tsx"
    source = read(path)
    if "function hardwareClockNow()" not in source:
        marker = "export function DeviceConnectionHubPanel"
        index = source.find(marker)
        if index < 0:
            raise RuntimeError("DeviceConnectionHubPanel export not found")
        source = (
            source[:index]
            + "function hardwareClockNow(): number {\n  return Date.now();\n}\n\n"
            + source[index:]
        )
    source = source.replace(
        "connectStartedAt.current = Date.now();",
        "connectStartedAt.current = hardwareClockNow();",
    )

    memo = "const writableParameters = useMemo("
    index = source.find(memo)
    if index >= 0 and "parameterRevision intentionally invalidates" not in source[max(0, index - 300):index]:
        line = source.rfind("\n", 0, index) + 1
        source = (
            source[:line]
            + "  // parameterRevision intentionally invalidates the mutable CRSF session snapshot.\n"
            + "  // eslint-disable-next-line react-hooks/exhaustive-deps\n"
            + source[line:]
        )

    selected = source.find("setSelectedSettingId(null);")
    if selected >= 0 and "const normalizationTimer = setTimeout" not in source[max(0, selected - 1600): selected + 1600]:
        effect = source.rfind("useEffect(() => {", 0, selected)
        if effect < 0:
            raise RuntimeError("Settings normalization effect not found")
        body_start = effect + len("useEffect(() => {")
        body_end = matching_brace(source, source.find("{", effect))
        body = source[body_start:body_end]
        indented = "".join(
            ("  " + line if line.strip() else line)
            for line in body.splitlines(keepends=True)
        )
        replacement = (
            "\n    const normalizationTimer = setTimeout(() => {"
            + indented
            + "    }, 0);\n"
            + "    return () => clearTimeout(normalizationTimer);\n  "
        )
        source = source[:body_start] + replacement + source[body_end:]
    write(path, source)


def patch_serial() -> None:
    path = "apps/web/src/hardware/serial.ts"
    source = read(path)
    source = source.replace(
        "return Number.isSafeInteger(value) && (value as number) >= 0\n    ? (value as number)\n    : null;",
        "return (\n    Number.isSafeInteger(value) &&\n    (value as number) >= 0 &&\n    (value as number) <= 0xffff\n  )\n    ? (value as number)\n    : null;",
    )
    source = source.replace(
        "  #readTask: Promise<void> | null = null;\n  #closed = false;",
        "  #readTask: Promise<void> | null = null;\n"
        "  #streamCleanupTask: Promise<void> | null = null;\n"
        "  #portCloseTask: Promise<boolean> | null = null;\n"
        "  #portClosed = false;\n"
        "  #closed = false;",
    )
    source = source.replace(
        "    this.#reader = readable.getReader();\n"
        "    this.#writer = writable.getWriter();\n"
        "    this.#readTask = this.#readLoop();",
        "    let reader: HardwareSerialReader | null = null;\n"
        "    try {\n"
        "      reader = readable.getReader();\n"
        "      const writer = writable.getWriter();\n"
        "      this.#reader = reader;\n"
        "      this.#writer = writer;\n"
        "      this.#readTask = this.#readLoop();\n"
        "    } catch {\n"
        "      try {\n"
        "        reader?.releaseLock();\n"
        "      } catch {\n"
        "        // A partially acquired stream lock must not escape a failed start.\n"
        "      }\n"
        "      this.#reader = null;\n"
        "      this.#writer = null;\n"
        "      throw new HardwareSerialError(\n"
        "        \"CLOSED\",\n"
        "        \"The selected serial streams could not be locked\",\n"
        "      );\n"
        "    }",
    )
    source = source.replace(
        "    } catch (error: unknown) {\n"
        "      waiting.cancel();\n"
        "      throw error;\n"
        "    }\n"
        "    return waiting.promise;",
        "    } catch (error: unknown) {\n"
        "      waiting.cancel();\n"
        "      await waiting.promise.catch(() => undefined);\n"
        "      throw error;\n"
        "    }\n"
        "    return waiting.promise;",
    )

    close_start = source.find("  public async close(\n")
    close_end = source.find("  async #readLoop(): Promise<void> {", close_start)
    if close_start < 0 or close_end < 0:
        raise RuntimeError("Serial close block not found")
    current = source[close_start:close_end]
    if "#cleanupStreams" not in current:
        replacement = '''  public async close(
    input: { readonly closePort?: boolean } = {},
  ): Promise<boolean> {
    if (!this.#closed) {
      this.#closed = true;
      this.#rejectAll(
        new HardwareSerialError("CLOSED", "The serial link was closed"),
      );
    }

    await this.#cleanupStreams();

    if (input.closePort === false || this.#portClosed) {
      return true;
    }
    if (this.#portCloseTask !== null) {
      return this.#portCloseTask;
    }
    this.#portCloseTask = (async () => {
      try {
        await this.#port.close();
        this.#portClosed = true;
        return true;
      } catch {
        return false;
      }
    })();
    return this.#portCloseTask;
  }

  async #cleanupStreams(): Promise<void> {
    if (this.#streamCleanupTask !== null) {
      await this.#streamCleanupTask;
      return;
    }

    this.#streamCleanupTask = (async () => {
      const reader = this.#reader;
      const writer = this.#writer;
      const readTask = this.#readTask;
      this.#reader = null;
      this.#writer = null;
      this.#readTask = null;

      try {
        await reader?.cancel();
      } catch {
        // Reader cancellation is best effort; locks are released below.
      }
      try {
        await readTask;
      } catch {
        // The read loop already maps failures to pending operations.
      }
      try {
        reader?.releaseLock();
      } catch {
        // A browser may already have released a disconnected reader lock.
      }
      try {
        writer?.releaseLock();
      } catch {
        // A browser may already have released a disconnected writer lock.
      }
    })();

    await this.#streamCleanupTask;
  }

'''
        source = source[:close_start] + replacement + source[close_end:]

    for old, new in [
        (
            '''      if (!this.#closed) {
        this.#closed = true;
        this.#rejectAll(
          new HardwareSerialError(
            "READ_FAILED",
            "The device serial stream ended unexpectedly",
          ),
        );
      }''',
            '''      if (!this.#closed) {
        this.#closed = true;
        this.#rejectAll(
          new HardwareSerialError(
            "READ_FAILED",
            "The device serial stream ended unexpectedly",
          ),
        );
        queueMicrotask(() => {
          void this.close();
        });
      }''',
        ),
        (
            '''      if (!this.#closed) {
        this.#closed = true;
        this.#rejectAll(
          new HardwareSerialError(
            "READ_FAILED",
            "Reading from the serial port failed",
          ),
        );
      }''',
            '''      if (!this.#closed) {
        this.#closed = true;
        this.#rejectAll(
          new HardwareSerialError(
            "READ_FAILED",
            "Reading from the serial port failed",
          ),
        );
        queueMicrotask(() => {
          void this.close();
        });
      }''',
        ),
    ]:
        source = source.replace(old, new, 1)
    write(path, source)


def patch_crsf() -> None:
    path = "apps/web/src/hardware/crsf.ts"
    source = read(path)
    if "CRSF_MAX_INPUT_CHUNK_SIZE" not in source:
        source = source.replace(
            "export const CRSF_MAX_FRAME_SIZE = 64 as const;",
            "export const CRSF_MAX_FRAME_SIZE = 64 as const;\n"
            "export const CRSF_MAX_INPUT_CHUNK_SIZE = 65_536 as const;",
            1,
        )
    source = source.replace(
        "  public push(chunk: Uint8Array): readonly CrsfFrame[] {\n"
        "    if (chunk.byteLength === 0) {\n"
        "      return Object.freeze([]);\n"
        "    }\n"
        "    this.#buffer = concatBytes(this.#buffer, chunk);",
        "  public push(chunk: Uint8Array): readonly CrsfFrame[] {\n"
        "    if (chunk.byteLength === 0) {\n"
        "      return Object.freeze([]);\n"
        "    }\n"
        "    if (chunk.byteLength > CRSF_MAX_INPUT_CHUNK_SIZE) {\n"
        "      throw new RangeError(\n"
        "        `CRSF input chunk exceeds ${CRSF_MAX_INPUT_CHUNK_SIZE} bytes`,\n"
        "      );\n"
        "    }\n"
        "    this.#buffer = concatBytes(this.#buffer, chunk);",
    )
    exported = "export function parseCrsfDeviceInfo("
    if exported in source and "function parseCrsfDeviceInfoUnsafe(" not in source:
        index = source.find(exported)
        source = source[:index] + source[index:].replace(
            exported, "function parseCrsfDeviceInfoUnsafe(", 1
        )
        index = source.find("function parseCrsfDeviceInfoUnsafe(")
        opening = source.find("{", index)
        end = matching_brace(source, opening) + 1
        wrapper = '''

export function parseCrsfDeviceInfo(
  frame: CrsfFrame,
): CrsfDeviceInfo | null {
  try {
    return parseCrsfDeviceInfoUnsafe(frame);
  } catch {
    return null;
  }
}'''
        source = source[:end] + wrapper + source[end:]
    for name in ("createLegacyBootloaderCommand", "createLegacyBindCommand"):
        marker = (
            f'export function {name}(targetKey = ""): Uint8Array {{\n'
            "  const encodedKey = new TextEncoder().encode(targetKey);"
        )
        block = source[source.find(marker): source.find(marker) + 500]
        if marker in source and "Legacy CRSF target key is too long" not in block:
            source = source.replace(
                marker,
                marker
                + "\n  if (encodedKey.byteLength > CRSF_MAX_FRAME_SIZE - 6) {\n"
                + '    throw new RangeError("Legacy CRSF target key is too long");\n'
                + "  }",
                1,
            )
    write(path, source)


def replace_message(path: str, key: str, value: str) -> None:
    source = read(path)
    pattern = rf'  "{re.escape(key)}":\s*(?:\n\s*)?"(?:[^"\\]|\\.)*",'
    replacement = f'  "{key}": "{value}",'
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Could not update {key} in {path}")
    write(path, updated)


def add_static_gate() -> None:
    script = '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const serial = read("apps/web/src/hardware/serial.ts");
const crsf = read("apps/web/src/hardware/crsf.ts");
const session = read("apps/web/src/hardware/session.ts");
const userSession = read("apps/web/src/hardware/userSession.ts");
const hub = read("apps/web/src/components/DeviceConnectionHub.tsx");
const main = read("apps/web/src/main.tsx");
const arabic = read("packages/i18n/src/locales/ar.ts");
const english = read("packages/i18n/src/locales/en.ts");

const failures = [];
function requireInvariant(ok, message) {
  if (!ok) failures.push(message);
}

requireInvariant(/EXPRESSLRS_CRSF_BAUD_RATE\\s*=\\s*420_000/u.test(serial), "Direct hardware serial must use the ExpressLRS CRSF baud rate.");
requireInvariant(/CRSF_MAX_INPUT_CHUNK_SIZE/u.test(crsf), "CRSF input chunks must be bounded before allocation.");
requireInvariant(/crc8DvbS2/u.test(crsf) && /devicePing/u.test(crsf) && /deviceInfo/u.test(crsf), "CRSF identity must require Ping, Device Info, and CRC validation.");
requireInvariant(/expressLrsMarkerValid/u.test(session), "A serial port opening must not substitute for the ELRS Device Info marker.");
requireInvariant(/writeParameter/u.test(session) && /readParameter/u.test(session), "Settings writes must retain an explicit read-back path.");
requireInvariant(/restoreSettingsBackup/u.test(session), "Settings changes must retain a recovery path.");
requireInvariant(/connectExpressLrsForUser/u.test(userSession), "The user session must own the bounded connection workflow.");
requireInvariant(/connectExpressLrsForUser/u.test(hub), "The visible connection hub must call the real bounded user session.");
requireInvariant(/DeviceConnectionHubPanel/u.test(main), "The production entry point must render the real hardware connection hub.");
requireInvariant(!/connectWebSerialReadOnly/u.test(hub), "The production hardware hub must not fall back to transport-open-only semantics.");
requireInvariant(!/115_200/u.test(hub), "The direct CRSF user journey must not silently use 115200 baud.");
requireInvariant(/session\\.close|hardwareSession.*close|closeHardwareSession/u.test(hub), "The visible workflow must expose deterministic session cleanup.");
requireInvariant(!/الكتابة على الأجهزة معطّلة/u.test(arabic), "Arabic copy must not contradict verified CRSF settings/bind controls.");
requireInvariant(!/hardware writes are disabled/iu.test(english), "English copy must not contradict verified CRSF settings/bind controls.");
requireInvariant(/تفليش|firmware/iu.test(arabic) && /firmware/iu.test(english), "Both locales must state the remaining firmware-write boundary.");

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Hardware user-journey invariants passed.");
'''
    write("scripts/check-hardware-user-journey.mjs", script)
    package = json.loads(read("package.json"))
    package.setdefault("scripts", {})["check:hardware-journey"] = (
        "node scripts/check-hardware-user-journey.mjs"
    )
    write("package.json", json.dumps(package, ensure_ascii=False, indent=2) + "\n")
    ci = read(".github/workflows/ci.yml")
    if "pnpm check:hardware-journey" not in ci:
        marker = "          pnpm check:master-plan\n"
        if marker not in ci:
            raise RuntimeError("CI gate insertion marker not found")
        ci = ci.replace(marker, marker + "          pnpm check:hardware-journey\n", 1)
        write(".github/workflows/ci.yml", ci)


def add_regression_tests() -> None:
    test = r'''import { describe, expect, it, vi } from "vitest";

import {
  CRSF_MAX_INPUT_CHUNK_SIZE,
  CrsfAddress,
  CrsfFrameType,
  CrsfStreamParser,
  createDevicePing,
  createLegacyBindCommand,
  createLegacyBootloaderCommand,
  parseCrsfDeviceInfo,
  type CrsfFrame,
} from "./crsf";
import {
  CrsfSerialLink,
  HardwareSerialError,
  requestAndOpenHardwareSerial,
  type HardwareSerialPort,
  type HardwareSerialReader,
  type HardwareSerialWriter,
} from "./serial";

function malformedDeviceInfoFrame(): CrsfFrame {
  const payload = new Uint8Array([
    CrsfAddress.usb,
    CrsfAddress.transmitter,
    0x45,
    0x4c,
    0x52,
    0x53,
  ]);
  return Object.freeze({
    address: CrsfAddress.radio,
    frameSize: payload.byteLength + 2,
    type: CrsfFrameType.deviceInfo,
    payload,
    raw: new Uint8Array(),
  });
}

function immediateEndPort() {
  const reader: HardwareSerialReader = {
    read: vi.fn().mockResolvedValue({ done: true }),
    cancel: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  };
  const writer: HardwareSerialWriter = {
    write: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  };
  const port: HardwareSerialPort = {
    readable: { getReader: () => reader },
    writable: { getWriter: () => writer },
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { port, reader, writer };
}

describe("hardware transport hardening", () => {
  it("fails closed when DEVICE_INFO contains a malformed device-controlled string", () => {
    expect(parseCrsfDeviceInfo(malformedDeviceInfoFrame())).toBeNull();
  });

  it("rejects a single hostile serial chunk before duplicating an unbounded allocation", () => {
    const parser = new CrsfStreamParser();
    expect(() =>
      parser.push(new Uint8Array(CRSF_MAX_INPUT_CHUNK_SIZE + 1)),
    ).toThrow(RangeError);
  });

  it("bounds legacy Bind and Bootloader target keys to one CRSF frame", () => {
    const oversized = "X".repeat(59);
    expect(() => createLegacyBindCommand(oversized)).toThrow(RangeError);
    expect(() => createLegacyBootloaderCommand(oversized)).toThrow(RangeError);
  });

  it("releases a reader lock when acquiring the writer lock fails", () => {
    const reader: HardwareSerialReader = {
      read: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };
    const port: HardwareSerialPort = {
      readable: { getReader: () => reader },
      writable: {
        getWriter: () => {
          throw new Error("writer already locked");
        },
      },
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const link = new CrsfSerialLink(port);
    expect(() => link.start()).toThrow(HardwareSerialError);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("releases stream locks and closes the port after an unexpected EOF", async () => {
    const { port, reader, writer } = immediateEndPort();
    const link = new CrsfSerialLink(port);
    link.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await link.close();
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(writer.releaseLock).toHaveBeenCalledTimes(1);
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent close calls so the browser port is closed once", async () => {
    const { port } = immediateEndPort();
    const link = new CrsfSerialLink(port);
    link.start();
    const results = await Promise.all([link.close(), link.close(), link.close()]);
    expect(results).toEqual([true, true, true]);
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("consumes the cancelled waiter when a serial write fails", async () => {
    let finishRead: ((value: { done: boolean }) => void) | undefined;
    const reader: HardwareSerialReader = {
      read: () => new Promise((resolve) => { finishRead = resolve; }),
      cancel: async () => finishRead?.({ done: true }),
      releaseLock: vi.fn(),
    };
    const writer: HardwareSerialWriter = {
      write: vi.fn().mockRejectedValue(new Error("USB disappeared")),
      releaseLock: vi.fn(),
    };
    const port: HardwareSerialPort = {
      readable: { getReader: () => reader },
      writable: { getWriter: () => writer },
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const link = new CrsfSerialLink(port);
    link.start();
    await expect(
      link.request(createDevicePing(), () => true, { timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });
    await link.close();
  });

  it("rejects impossible USB VID/PID values instead of presenting them as hardware evidence", async () => {
    const { port } = immediateEndPort();
    port.getInfo = () => ({
      usbVendorId: 0x1_0000,
      usbProductId: Number.MAX_SAFE_INTEGER,
    });
    const outcome = await requestAndOpenHardwareSerial({
      navigatorObject: { serial: { requestPort: vi.fn().mockResolvedValue(port) } },
      secureContext: true,
    });
    expect(outcome.status).toBe("OPEN");
    if (outcome.status !== "OPEN") return;
    expect(outcome.info).toEqual({ usbVendorId: null, usbProductId: null });
    await outcome.port.close();
  });
});
'''
    write("apps/web/src/hardware/transport-hardening.test.ts", test)


patch_component()
patch_serial()
patch_crsf()
replace_message(
    "packages/i18n/src/locales/ar.ts",
    "app.mockNotice",
    "نسخة اختبار عتاد. اتصال CRSF والإعدادات والربط تتطلب هوية جهاز صحيحة؛ تفليش Firmware ما زال مغلقًا حتى اعتماد Target والاستعادة.",
)
replace_message(
    "packages/i18n/src/locales/ar.ts",
    "task.previewOnly",
    "هذه بطاقة محاكاة منفصلة. عمليات الجهاز الحقيقية توجد داخل لوحة اتصال الجهاز فقط.",
)
replace_message(
    "packages/i18n/src/locales/en.ts",
    "app.mockNotice",
    "Hardware test build. CRSF connection, settings, and binding require a verified device identity; firmware flashing remains gated until Target and recovery are approved.",
)
replace_message(
    "packages/i18n/src/locales/en.ts",
    "task.previewOnly",
    "This is a separate simulation card. Real device operations are available only inside the device connection panel.",
)
add_static_gate()
add_regression_tests()
