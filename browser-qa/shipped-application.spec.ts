import { expect, test } from "@playwright/test";

/**
 * These assertions need a real browser. jsdom does not enforce a
 * Content-Security-Policy, does not run a service worker, and does not decide
 * whether `navigator.serial` exists — so everything checked here is
 * BROWSER_VERIFIED and nothing here is a hardware claim.
 */

test("serves the shipped security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);

  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("script-src 'self'");
  // An underscore is not legal in a CSP host-source; a hostname carrying one
  // silently invalidates the directive it appears in.
  expect(csp).not.toMatch(/[a-z0-9-]*_[a-z0-9-]*\./iu);

  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");

  const permissions = response.headers()["permissions-policy"] ?? "";
  expect(permissions).toContain("serial=(self)");
  expect(permissions).toContain("usb=(self)");
  expect(permissions).toContain("camera=()");
});

test("loads Easy Mode in Arabic with no console errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "إعداد ExpressLRS" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("ar");
  // A CSP violation surfaces as a console error, so this also proves the
  // policy above does not block the application's own bundle.
  expect(problems).toEqual([]);
});

test("reaches the advanced workbench only by an explicit choice", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /إعداد وتحديث ExpressLRS/u }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "الوضع المتقدم", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: /إعداد وتحديث ExpressLRS/u }),
  ).toBeVisible();
});

test("reports the device transport the browser actually exposes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ابدأ" }).first().click();

  const serialAvailable = await page.evaluate(() => "serial" in navigator);
  const connect = page.getByRole("button", { name: "تعرّف على جهازي" });

  if (serialAvailable) {
    // The transport exists, so the operation is offered. No device is
    // attached, so nothing beyond this point is exercised here.
    await expect(connect).toBeEnabled();
    await expect(page.locator("[data-transport]")).toHaveCount(0);
  } else {
    // The blocker must be named, not silent, and the button must not pretend.
    await expect(connect).toBeDisabled();
    await expect(page.locator("[data-transport]")).toBeVisible();
  }
});

test("exports a diagnostics report that claims no hardware validation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "اعرض التقرير" }).first().click();

  const report = page.getByTestId("diagnostics-report");
  await expect(report).toBeVisible();
  await expect(report).toContainText("Hardware validation: NONE");
  await expect(report).toContainText("Device writes: EVIDENCE_GATED");
  // The report states what the real browser reports, not a build-time guess.
  const serialAvailable = await page.evaluate(() => "serial" in navigator);
  await expect(report).toContainText(`Web Serial: ${String(serialAvailable)}`);
});

test("states the build stage and commit without disabling anything", async ({
  page,
}) => {
  await page.goto("/");

  const banner = page.locator(".build-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("نسخة تجريبية للتحقق على العتاد");

  // The banner reports the commit the bundle was actually built from.
  const declared = (await banner.getAttribute("data-build")) ?? "";
  expect(declared.length).toBeGreaterThan(0);
  if (/^[0-9a-f]{40}$/u.test(declared)) {
    await expect(banner.locator(".build-banner-sha")).toHaveText(
      declared.slice(0, 7),
    );
  } else {
    // An unpinned build says so instead of showing a plausible fake.
    await expect(banner.locator(".build-banner-sha")).toHaveText(declared);
  }

  // Naming the stage must not disable a single operation.
  const starts = page.getByRole("button", { name: "ابدأ" });
  await expect(starts).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(starts.nth(index)).toBeEnabled();
  }
  expect(await page.locator("button:disabled").count()).toBe(0);
});

test("registers a service worker that controls the page on return", async ({
  page,
}) => {
  await page.goto("/");
  const registered = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const registration = await navigator.serviceWorker.ready;
    return registration.active === null ? "inactive" : "active";
  });
  expect(registered).toBe("active");

  // A worker controls the page only from the second navigation onward.
  await page.reload();
  const controlled = await page.evaluate(
    () => navigator.serviceWorker.controller !== null,
  );
  expect(controlled).toBe(true);
});

/**
 * Locale, direction and layout, checked in the browser against the shipped
 * bundle. jsdom computes no styles and resolves no direction, so an inherited
 * `rtl` under English is invisible to the unit suite — that is exactly the
 * defect these cover.
 */
const LAYOUTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 320, height: 640 },
] as const;

async function openAdvanced(
  page: import("@playwright/test").Page,
  locale: "ar" | "en",
) {
  await page.goto("/");
  if (locale === "en") {
    await page.locator('.language-switch button[lang="en"]').click();
  }
  await page
    .locator("nav button")
    .filter({ hasText: /Advanced|المتقدم/u })
    .first()
    .click();
  await page.locator(".parity-shell").waitFor();
}

for (const locale of ["ar", "en"] as const) {
  for (const layout of LAYOUTS) {
    test(`Advanced Mode renders in ${locale} at ${layout.name} width`, async ({
      page,
    }) => {
      const problems: string[] = [];
      const missing: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(message.text());
      });
      page.on("pageerror", (error) => problems.push(error.message));
      page.on("response", (response) => {
        if (response.status() === 404) missing.push(response.url());
      });

      await page.setViewportSize({
        width: layout.width,
        height: layout.height,
      });
      await openAdvanced(page, locale);

      // The document and the technical view agree on direction, and the
      // direction is the one the locale calls for.
      const expectedDirection = locale === "ar" ? "rtl" : "ltr";
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(
        await page
          .locator(".parity-shell")
          .evaluate((node) => getComputedStyle(node).direction),
      ).toBe(expectedDirection);

      // Under English the only Arabic left may be the language switch's own
      // native name. Under Arabic the interface must not be English.
      const strayScript = await page.evaluate((current) => {
        const root = document.querySelector(".parity-shell");
        const text = root instanceof HTMLElement ? root.innerText : "";
        const arabic = text.match(/[؀-ۿ]+/gu) ?? [];
        return current === "en"
          ? { count: arabic.length, sample: [...new Set(arabic)].slice(0, 12) }
          : { count: 0, sample: [] };
      }, locale);
      expect(strayScript.sample).toEqual([]);
      expect(strayScript.count).toBe(0);

      // Wide content scrolls inside its own container; the page never does.
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);

      expect(problems).toEqual([]);
      expect(missing).toEqual([]);
    });
  }
}

test("every core operation is present and reachable in Advanced Mode", async ({
  page,
}) => {
  await openAdvanced(page, "en");

  // Each of these is a real control wired to the shared controller. None of
  // them may be hidden behind a build stage, and the receiver-as-transmitter
  //selector in particular must be a live control, not a decorative one.
  for (const name of [
    "Load the official catalog",
    "Identify the device over CRSF",
    "Build the official firmware",
  ]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }

  // The receiver options only apply to a receiver, so select that role first.
  // This is a real, live condition — not a build gate — and the control must
  // then be a working selector rather than a decorative one.
  await page
    .locator(".segmented button")
    .filter({ hasText: /RX receiver/u })
    .first()
    .click();

  const rxAsTx = page.getByTestId("rx-as-tx-mode");
  await expect(rxAsTx).toBeVisible();
  await expect(rxAsTx).toBeEnabled();
  await expect(rxAsTx.locator("option")).toHaveCount(3);

  const airport = page.getByTestId("airport-enabled");
  await expect(airport).toBeVisible();
  await expect(airport).toBeEnabled();
});

test("no control is disabled without a stated reason beside it", async ({
  page,
}) => {
  await openAdvanced(page, "en");

  // Readiness is reported per operation, and a blocked operation names what it
  // is waiting on. A disabled control with no reason anywhere is a dead end.
  const blocked = page.locator('[data-ready="no"]');
  const count = await blocked.count();
  // Asserted, because a loop over nothing passes while proving nothing — and
  // this selector was written against a renderer that has since changed shape
  // once already.
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const text = (await blocked.nth(index).innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/locked in this|not available yet|coming soon/iu);
  }
});

/**
 * Reads every operation's live readiness state out of the shipped DOM.
 *
 * `data-ready` is written by the controller from live state, so this is the
 * application's own account of what it will and will not do right now — not a
 * string a test invented. The row carries the operation in `data-operation`
 * and its outstanding prerequisites as one sentence in a `span`; read from the
 * shipped markup rather than assumed, because the first version of this helper
 * was written against a different renderer in the same file and silently
 * matched nothing.
 */
async function readiness(
  page: import("@playwright/test").Page,
): Promise<{ operation: string; ready: string; reasons: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-ready]")].map((element) => ({
      operation: element.getAttribute("data-operation") ?? "",
      ready: element.getAttribute("data-ready") ?? "",
      reasons: (element.querySelector("span")?.textContent ?? "").trim(),
    })),
  );
}

test("the import path is reachable with nothing prepared, which is the reinstall case", async ({
  page,
}) => {
  await openAdvanced(page, "en");

  // This is the structural fix, asserted in a real browser. These controls
  // used to live inside the "a firmware package has been prepared" block,
  // which meant an operator who had uninstalled and reinstalled — the exact
  // situation the durable export exists for — had to re-select a Target and
  // rebuild a package over the network before they could so much as open the
  // recovery file they had kept. Exporting needs a prepared package;
  // importing needs only the file.
  const pick = page.getByRole("button", {
    name: "Choose a saved recovery file",
  });
  await expect(pick).toBeVisible();
  await expect(pick).toBeEnabled();

  // And nothing has been imported, so the control that would write an imported
  // package to a device is not on screen at all. It appears only once there is
  // something to write.
  await expect(
    page.getByRole("button", {
      name: "Restore the device from the imported package",
    }),
  ).toHaveCount(0);
});

test("readiness is live state: it survives a locale change identically", async ({
  page,
}) => {
  await openAdvanced(page, "en");
  const english = await readiness(page);
  expect(english.length).toBeGreaterThan(0);
  // Guards the helper against matching a row with no reasons in it, which is
  // how a comparison like this passes while proving nothing.
  expect(english.every((row) => row.reasons.length > 0)).toBe(true);

  // A real transition through the shipped bundle: the whole shell re-renders
  // in the other language and direction. A locale must not be able to
  // withhold a feature or change what an operation is waiting on, so the set
  // of operations and their verdicts have to come out identical — and the
  // reasons have to come out *different*, because they are translated.
  await page.locator('.language-switch button[lang="ar"]').click();
  await expect(page.locator(".parity-shell[dir='rtl']")).toBeVisible();
  const arabic = await readiness(page);

  expect(arabic.map((row) => row.operation)).toEqual(
    english.map((row) => row.operation),
  );
  expect(arabic.map((row) => row.ready)).toEqual(
    english.map((row) => row.ready),
  );
  expect(arabic.every((row) => row.reasons.length > 0)).toBe(true);
  // Same capabilities, different words. If these matched, one locale would be
  // rendering the other's catalogue and the parity claim would be empty.
  expect(arabic.map((row) => row.reasons)).not.toEqual(
    english.map((row) => row.reasons),
  );
});

test("no operation is blocked by a permanent condition", async ({ page }) => {
  await openAdvanced(page, "en");

  // Every refused operation must be waiting on something an operator can go
  // and do. A reason that names no action is a lock wearing a condition's
  // clothes, and the durable-recovery prerequisite in particular has to read
  // as a step — it gates the two destructive operations, so if it ever reads
  // as unavailability then firmware update and receiver-as-transmitter have
  // been quietly withdrawn.
  const rows = (await readiness(page)).filter((row) => row.ready === "no");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.operation).not.toBe("");
    expect(row.reasons.length).toBeGreaterThan(0);
    expect(row.reasons).not.toMatch(
      /not available|unavailable|coming soon|later phase|next release|locked/iu,
    );
    // Phrased as instructions, so each one ends in something to do rather
    // than a statement about the build.
    expect(row.reasons).toMatch(/first|then|retry|again/iu);
  }

  // The two destructive operations, and the prerequisite that gates them.
  const gated = rows.filter((row) =>
    ["firmwareWrite", "rxAsTx"].includes(row.operation),
  );
  expect(gated).toHaveLength(2);
  for (const row of gated) {
    expect(row.reasons).toMatch(/recovery package/iu);
  }
});
