export type BoundedJsonValue =
  | null
  | boolean
  | number
  | string
  | BoundedJsonValue[]
  | { [key: string]: BoundedJsonValue };

export const boundedJsonFailureCodes = [
  "INVALID_JSON",
  "DUPLICATE_KEY",
  "LIMIT_EXCEEDED",
  "UNSAFE_NUMBER",
  "INVALID_UNICODE",
] as const;

export type BoundedJsonFailureCode = (typeof boundedJsonFailureCodes)[number];

export interface BoundedJsonLimits {
  readonly maximumUtf8Bytes: number;
  readonly maximumDepth: number;
  readonly maximumStringCodeUnits: number;
  readonly maximumArrayElements: number;
  readonly maximumObjectMembers: number;
  readonly maximumTotalValues: number;
}

export class BoundedJsonError extends Error {
  public readonly code: BoundedJsonFailureCode;

  public constructor(code: BoundedJsonFailureCode) {
    super(code);
    this.name = "BoundedJsonError";
    this.code = code;
  }
}

const utf8Encoder = new TextEncoder();
const hexDigitPattern = /^[0-9a-fA-F]$/u;

function fail(code: BoundedJsonFailureCode): never {
  throw new BoundedJsonError(code);
}

function assertUnicodeScalarSequence(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) {
        fail("INVALID_UNICODE");
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail("INVALID_UNICODE");
    }
  }
}

class BoundedJsonParser {
  readonly #source: string;
  readonly #limits: BoundedJsonLimits;
  #index = 0;
  #valueCount = 0;

  public constructor(source: string, limits: BoundedJsonLimits) {
    this.#source = source;
    this.#limits = limits;
  }

  public parse(): BoundedJsonValue {
    this.#skipWhitespace();
    if (this.#index === this.#source.length) {
      fail("INVALID_JSON");
    }
    const value = this.#parseValue(0);
    this.#skipWhitespace();
    if (this.#index !== this.#source.length) {
      fail("INVALID_JSON");
    }
    return value;
  }

  #parseValue(depth: number): BoundedJsonValue {
    if (depth > this.#limits.maximumDepth) {
      fail("LIMIT_EXCEEDED");
    }
    this.#valueCount += 1;
    if (this.#valueCount > this.#limits.maximumTotalValues) {
      fail("LIMIT_EXCEEDED");
    }

    const token = this.#source[this.#index];
    switch (token) {
      case "{":
        return this.#parseObject(depth);
      case "[":
        return this.#parseArray(depth);
      case '"':
        return this.#parseString();
      case "t":
        return this.#parseLiteral("true", true);
      case "f":
        return this.#parseLiteral("false", false);
      case "n":
        return this.#parseLiteral("null", null);
      default:
        if (token === "-" || (token !== undefined && /[0-9]/u.test(token))) {
          return this.#parseSafeInteger();
        }
        return fail("INVALID_JSON");
    }
  }

  #parseObject(depth: number): { [key: string]: BoundedJsonValue } {
    this.#index += 1;
    this.#skipWhitespace();
    const result = Object.create(null) as {
      [key: string]: BoundedJsonValue;
    };
    const keys = new Set<string>();
    if (this.#source[this.#index] === "}") {
      this.#index += 1;
      return result;
    }

    let memberCount = 0;
    while (this.#index < this.#source.length) {
      if (this.#source[this.#index] !== '"') {
        fail("INVALID_JSON");
      }
      const key = this.#parseString();
      if (keys.has(key)) {
        fail("DUPLICATE_KEY");
      }
      keys.add(key);
      memberCount += 1;
      if (memberCount > this.#limits.maximumObjectMembers) {
        fail("LIMIT_EXCEEDED");
      }

      this.#skipWhitespace();
      if (this.#source[this.#index] !== ":") {
        fail("INVALID_JSON");
      }
      this.#index += 1;
      this.#skipWhitespace();
      result[key] = this.#parseValue(depth + 1);
      this.#skipWhitespace();

      const delimiter = this.#source[this.#index];
      if (delimiter === "}") {
        this.#index += 1;
        return result;
      }
      if (delimiter !== ",") {
        fail("INVALID_JSON");
      }
      this.#index += 1;
      this.#skipWhitespace();
    }
    return fail("INVALID_JSON");
  }

  #parseArray(depth: number): BoundedJsonValue[] {
    this.#index += 1;
    this.#skipWhitespace();
    const result: BoundedJsonValue[] = [];
    if (this.#source[this.#index] === "]") {
      this.#index += 1;
      return result;
    }

    while (this.#index < this.#source.length) {
      if (result.length >= this.#limits.maximumArrayElements) {
        fail("LIMIT_EXCEEDED");
      }
      result.push(this.#parseValue(depth + 1));
      this.#skipWhitespace();
      const delimiter = this.#source[this.#index];
      if (delimiter === "]") {
        this.#index += 1;
        return result;
      }
      if (delimiter !== ",") {
        fail("INVALID_JSON");
      }
      this.#index += 1;
      this.#skipWhitespace();
    }
    return fail("INVALID_JSON");
  }

  #parseString(): string {
    this.#index += 1;
    let result = "";
    while (this.#index < this.#source.length) {
      const value = this.#source[this.#index];
      this.#index += 1;
      if (value === '"') {
        if (result.length > this.#limits.maximumStringCodeUnits) {
          fail("LIMIT_EXCEEDED");
        }
        assertUnicodeScalarSequence(result);
        return result;
      }
      if (value === "\\") {
        result += this.#parseEscape();
      } else {
        if (value === undefined || value.charCodeAt(0) < 0x20) {
          fail("INVALID_JSON");
        }
        result += value;
      }
      if (result.length > this.#limits.maximumStringCodeUnits) {
        fail("LIMIT_EXCEEDED");
      }
    }
    return fail("INVALID_JSON");
  }

  #parseEscape(): string {
    const escaped = this.#source[this.#index];
    this.#index += 1;
    switch (escaped) {
      case '"':
      case "\\":
      case "/":
        return escaped;
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "u": {
        const hex = this.#source.slice(this.#index, this.#index + 4);
        if (
          hex.length !== 4 ||
          [...hex].some((digit) => !hexDigitPattern.test(digit))
        ) {
          fail("INVALID_JSON");
        }
        this.#index += 4;
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      default:
        return fail("INVALID_JSON");
    }
  }

  #parseLiteral<T extends boolean | null>(spelling: string, value: T): T {
    if (
      this.#source.slice(this.#index, this.#index + spelling.length) !==
      spelling
    ) {
      fail("INVALID_JSON");
    }
    this.#index += spelling.length;
    return value;
  }

  #parseSafeInteger(): number {
    const start = this.#index;
    if (this.#source[this.#index] === "-") {
      this.#index += 1;
    }

    const firstDigit = this.#source[this.#index];
    if (firstDigit === "0") {
      this.#index += 1;
      if (/[0-9]/u.test(this.#source[this.#index] ?? "")) {
        fail("INVALID_JSON");
      }
    } else if (firstDigit !== undefined && /[1-9]/u.test(firstDigit)) {
      this.#index += 1;
      while (/[0-9]/u.test(this.#source[this.#index] ?? "")) {
        this.#index += 1;
      }
    } else {
      fail("INVALID_JSON");
    }

    const following = this.#source[this.#index];
    if (following === "." || following === "e" || following === "E") {
      fail("UNSAFE_NUMBER");
    }

    const value = Number(this.#source.slice(start, this.#index));
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      fail("UNSAFE_NUMBER");
    }
    return value;
  }

  #skipWhitespace(): void {
    while (true) {
      const value = this.#source[this.#index];
      if (value !== " " && value !== "\t" && value !== "\r" && value !== "\n") {
        return;
      }
      this.#index += 1;
    }
  }
}

/** Strict JSON parser used only for security-sensitive, size-bounded inputs. */
export function parseBoundedJson(
  source: string,
  limits: BoundedJsonLimits,
): BoundedJsonValue {
  if (
    !Number.isSafeInteger(limits.maximumUtf8Bytes) ||
    limits.maximumUtf8Bytes <= 0 ||
    utf8Encoder.encode(source).byteLength > limits.maximumUtf8Bytes
  ) {
    fail("LIMIT_EXCEEDED");
  }
  return new BoundedJsonParser(source, limits).parse();
}

/** RFC 8785 serialization for the parser's safe-integer I-JSON subset. */
export function canonicalizeBoundedJson(value: BoundedJsonValue): string {
  if (value === null || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      fail("UNSAFE_NUMBER");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertUnicodeScalarSequence(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeBoundedJson(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      const propertyValue = value[key];
      if (propertyValue === undefined) {
        return fail("INVALID_JSON");
      }
      return `${canonicalizeBoundedJson(key)}:${canonicalizeBoundedJson(propertyValue)}`;
    })
    .join(",")}}`;
}
