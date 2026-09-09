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
