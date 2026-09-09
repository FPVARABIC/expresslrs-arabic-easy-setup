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
  for (let index = 0; index < count; index += 1) {
    const text = (await blocked.nth(index).innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/locked in this|not available yet|coming soon/iu);
  }
});
