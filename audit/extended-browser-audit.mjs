import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const localUrl = process.env.LOCAL_URL;
const publicUrl = process.env.PUBLIC_URL;
const expectedSha = process.env.EXPECTED_SHA;
const output = process.env.AUDIT_OUTPUT ?? "/tmp/extended-audit";
if (!localUrl || !publicUrl || !expectedSha) throw new Error("audit environment is incomplete");
await fs.mkdir(output, { recursive: true });

const results = [];
function assert(value, message) {
  if (!value) throw new Error(message);
}
async function step(name, action) {
  const started = Date.now();
  try {
    const detail = await action();
    results.push({ name, result: "PASS", durationMs: Date.now() - started, detail });
  } catch (error) {
    results.push({ name, result: "FAIL", durationMs: Date.now() - started, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
    throw error;
  } finally {
    await fs.writeFile(path.join(output, "extended-browser-audit.json"), JSON.stringify({ expectedSha, results }, null, 2));
  }
}
function crc(bytes) {
  let value = 0;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 0x80 ? ((value << 1) ^ 0xd5) & 0xff : (value << 1) & 0xff;
  }
  return value;
}
function deviceInfo({ role = "tx", validCrc = true, marker = true } = {}) {
  const destination = 0xea;
  const origin = role === "tx" ? 0xee : 0xec;
  const name = [...new TextEncoder().encode(role === "tx" ? "ExpressLRS TX" : "ExpressLRS RX"), 0];
  const payload = [destination, origin, ...name, ...(marker ? [0x45, 0x4c, 0x52, 0x53] : [0x54, 0x45, 0x53, 0x54]), 0, 0, 0, 1, 3, 5, 0, 0, 0, 1];
  const body = [0x29, ...payload];
  let checksum = crc(body);
  if (!validCrc) checksum ^= 0xff;
  return [destination, body.length + 1, ...body, checksum];
}
function serialInit(configuration) {
  const frame = deviceInfo(configuration);
  return `(() => {
    const configuration = ${JSON.stringify(configuration)};
    const frame = new Uint8Array(${JSON.stringify(frame)});
    const state = { openOptions: [], writes: 0, closes: 0 };
    Object.defineProperty(window, "__serialState", { value: state });
    let readableController;
    const readable = new ReadableStream({ start(controller) { readableController = controller; } });
    const writable = new WritableStream({ write() { state.writes += 1; if (configuration.mode === "frame" && state.writes === 1) queueMicrotask(() => readableController.enqueue(frame)); } });
    const port = {
      readable,
      writable,
      getInfo() { return { usbVendorId: 0x303a, usbProductId: 0x1001 }; },
      async open(options) { state.openOptions.push(options); if (configuration.mode === "open-fail") throw new DOMException("open failed", "NetworkError"); },
      async close() { state.closes += 1; try { readableController.close(); } catch {} },
    };
    Object.defineProperty(navigator, "serial", { configurable: true, value: {
      async requestPort() { if (configuration.mode === "cancel") throw new DOMException("cancelled", "NotFoundError"); return port; },
      async getPorts() { return []; }, addEventListener() {}, removeEventListener() {}
    }});
  })();`;
}
async function load(page, url) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  assert(response?.ok(), `navigation ${response?.status()}`);
  await page.locator("main").first().waitFor({ state: "visible" });
}
async function clickCatalog(page) {
  await page.getByRole("button", { name: /تحميل الكتالوج الرسمي/u }).click();
  await page.waitForFunction(() => /تم تحميل\s+\d+\s+إصدار/u.test(document.body.innerText) || /تعذر تحميل المصدر الرسمي/u.test(document.body.innerText), undefined, { timeout: 90_000 });
  const text = await page.locator("body").innerText();
  assert(/تم تحميل\s+\d+\s+إصدار/u.test(text), text.slice(0, 1200));
}
async function responsiveAndRuntime(browser, url, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  await load(page, url);
  await step(`${label}: runtime, RTL, Cairo, responsive and labels`, async () => {
    const initial = await page.evaluate(() => ({ dir: document.documentElement.dir, font: getComputedStyle(document.body).fontFamily }));
    assert(initial.dir === "rtl", `dir=${initial.dir}`);
    assert(/Cairo/iu.test(initial.font), `font=${initial.font}`);
    for (const size of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
      await page.setViewportSize(size);
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert(dimensions.scroll <= dimensions.client + 1, `${size.width}: ${dimensions.scroll}>${dimensions.client}`);
    }
    const integrity = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map(element => element.id).filter(Boolean);
      const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
      const unnamed = [...document.querySelectorAll("button")].filter(button => !((button.textContent ?? "").trim() || button.getAttribute("aria-label") || button.getAttribute("aria-labelledby"))).length;
      const unlabeled = [...document.querySelectorAll("input,select,textarea")].filter(element => {
        const id = element.id;
        return !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby") && !(id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) && !element.closest("label");
      }).length;
      return { duplicates, unnamed, unlabeled };
    });
    assert(integrity.duplicates.length === 0, `duplicate IDs ${integrity.duplicates}`);
    assert(integrity.unnamed === 0, `${integrity.unnamed} unnamed buttons`);
    assert(integrity.unlabeled === 0, `${integrity.unlabeled} unlabeled controls`);
    assert(errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true });
    return integrity;
  });
  await context.close();
}
async function serialCase(browser, configuration, expectedConnected, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript({ content: serialInit(configuration) });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await load(page, localUrl);
  await clickCatalog(page);
  await page.getByRole("button", { name: /تعريف الجهاز عبر CRSF/u }).click();
  await page.waitForTimeout(configuration.mode === "silent" ? 6500 : 1600);
  const body = await page.locator("body").innerText();
  const connected = /CRSF متصل/u.test(body) && !/لا توجد جلسة CRSF/u.test(body);
  assert(connected === expectedConnected, `${name}: connected=${connected}\n${body.slice(0, 1600)}`);
  const state = await page.evaluate(() => window.__serialState);
  if (configuration.mode !== "cancel") {
    assert(state.openOptions.length === 1, `${name}: open count ${state.openOptions.length}`);
    const options = state.openOptions[0];
    assert(options.baudRate === 420000, `${name}: baud=${options.baudRate}`);
    assert(options.dataBits === 8 && options.stopBits === 1 && options.parity === "none" && options.flowControl === "none", `${name}: invalid serial options ${JSON.stringify(options)}`);
  }
  assert(errors.length === 0, errors.join(" | "));
  await context.close();
  return { connected, state };
}

const browser = await chromium.launch({ headless: true });
try {
  await responsiveAndRuntime(browser, localUrl, "local");
  await responsiveAndRuntime(browser, publicUrl, "public");

  await step("official catalog, package build, Firmware and Recovery downloads", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    await load(page, localUrl);
    await clickCatalog(page);
    const region = page.getByLabel(/المنطقة التنظيمية/u);
    const regionValue = await region.locator('option:not([value=""])').first().getAttribute("value");
    assert(regionValue, "no regulatory region");
    await region.selectOption(regionValue);
    const target = page.getByLabel(/^Target$/u);
    const method = page.getByLabel(/طريقة التحديث/u);
    const targetCount = await target.locator("option").count();
    for (let index = 0; index < targetCount; index += 1) {
      await target.selectOption({ index });
      const methods = await method.locator("option").evaluateAll(options => options.map(option => option.value));
      if (methods.includes("download")) { await method.selectOption("download"); break; }
    }
    const build = page.getByRole("button", { name: /بناء Firmware الرسمي/u });
    assert(!(await build.isDisabled()), "build remains disabled");
    await build.click();
    await page.waitForFunction(() => /تم تجهيز\s+\d+\s+قطاع/u.test(document.body.innerText) || /تعذر تجهيز Firmware/u.test(document.body.innerText), undefined, { timeout: 180_000 });
    const body = await page.locator("body").innerText();
    assert(/تم تجهيز\s+\d+\s+قطاع/u.test(body), body.slice(0, 1800));
    const recoveryPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /تنزيل حزمة الاستعادة/u }).click();
    const recovery = await recoveryPromise;
    const recoveryPath = path.join(output, await recovery.suggestedFilename());
    await recovery.saveAs(recoveryPath);
    const firmwarePromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /تنزيل Firmware|تنزيل الحزمة/u }).first().click();
    const firmware = await firmwarePromise;
    const firmwarePath = path.join(output, await firmware.suggestedFilename());
    await firmware.saveAs(firmwarePath);
    const [a, b] = await Promise.all([fs.stat(recoveryPath), fs.stat(firmwarePath)]);
    assert(a.size > 100 && b.size > 100, `download sizes ${a.size}/${b.size}`);
    await context.close();
    return { recoveryBytes: a.size, firmwareBytes: b.size };
  });

  await step("serial cancellation", () => serialCase(browser, { mode: "cancel" }, false, "cancel"));
  await step("serial open failure", () => serialCase(browser, { mode: "open-fail" }, false, "open-fail"));
  await step("serial silence", () => serialCase(browser, { mode: "silent" }, false, "silent"));
  await step("bad CRSF CRC", () => serialCase(browser, { mode: "frame", validCrc: false }, false, "bad-crc"));
  await step("non-ELRS CRSF device", () => serialCase(browser, { mode: "frame", marker: false }, false, "not-elrs"));
  await step("wrong TX/RX role", () => serialCase(browser, { mode: "frame", role: "rx" }, false, "wrong-role"));
  await step("valid ELRS TX connection", () => serialCase(browser, { mode: "frame", role: "tx" }, true, "valid-tx"));
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "extended-browser-audit.json"), JSON.stringify({ expectedSha, results }, null, 2));
}
console.log(`Extended browser audit passed (${results.length} checks) for ${expectedSha}`);
