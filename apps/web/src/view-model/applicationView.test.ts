import { describe, expect, it } from "vitest";

import {
  buildApplicationViewHref,
  resolveApplicationView,
} from "./applicationView";

describe("application view routing", () => {
  it("selects only exact known single-value routes", () => {
    expect(resolveApplicationView("")).toBe("DEFAULT");
    expect(resolveApplicationView("?view=software-labs")).toBe(
      "SOFTWARE_LABS",
    );
    expect(resolveApplicationView("?view=binding-preview")).toBe(
      "BINDING_PREVIEW",
    );
    expect(resolveApplicationView("?view=firmware-preview")).toBe(
      "FIRMWARE_PREVIEW",
    );
    expect(resolveApplicationView("?view=unknown")).toBe("DEFAULT");
    expect(resolveApplicationView("?view=")).toBe("DEFAULT");
    expect(
      resolveApplicationView(
        "?view=software-labs&view=firmware-preview",
      ),
    ).toBe("DEFAULT");
  });

  it("builds same-origin relative links and preserves unrelated state", () => {
    expect(
      buildApplicationViewHref(
        "https://example.test/configurator?mode=easy#device",
        "SOFTWARE_LABS",
      ),
    ).toBe("/configurator?mode=easy&view=software-labs#device");
    expect(
      buildApplicationViewHref(
        "https://example.test/configurator?mode=easy&view=software-labs#device",
        "BINDING_PREVIEW",
      ),
    ).toBe("/configurator?mode=easy&view=binding-preview#device");
    expect(
      buildApplicationViewHref(
        "https://example.test/configurator?view=software-labs&mode=easy&view=firmware-preview#device",
        "DEFAULT",
      ),
    ).toBe("/configurator?mode=easy#device");
  });

  it("rejects a non-HTTP(S) base", () => {
    expect(() =>
      buildApplicationViewHref("javascript:alert(1)", "SOFTWARE_LABS"),
    ).toThrowError("Application view links require an HTTP(S) base URL");
  });
});
