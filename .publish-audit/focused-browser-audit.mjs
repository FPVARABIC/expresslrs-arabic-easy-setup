import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.AUDIT_URL;
const expectedSha = process.env.EXPECTED_SHA;
const outputDirectory = process.env.AUDIT_OUTPUT ?? "/tmp/browser-audit";

if (!baseUrl || !expectedSha) {
  throw new Error("AUDIT_URL and EXPECTED_SHA are required");
}

await fs.mkdir(outputDirectory, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function recorder(page) {
  const found = await page.evaluate(() => {
    const root = [...document.querySelectorAll("section,article,div")].find(
      (element) =>
        /القبول الفيزيائي|تسجيل النتائج الفيزيائية|جلسة الاختبار الفيزيائي/u.test(
          element.textContent ?? "",
        ) &&
        element.querySelector('select option[value="PASS"]'),
    );
    if (!(root instanceof HTMLElement)) return false;
    root.dataset.focusedAuditRecorder = "true";
    return true;
  });
  assert(found, "physical acceptance recorder is missing");
  return page.locator('[data-focused-audit-recorder="true"]').first();
}

async function statusControls(root) {
  return root.locator("select").evaluateAll((selects) =>
    selects
      .filter(
        (select) =>
          [...select.options].some((option) => option.value === "PASS") &&
          [...select.options].some((option) => option.value === "FAIL"),
      )
      .map((select) => ({ disabled: select.disabled, value: select.value })),
  );
}

async function editableFields(root) {
  return root.locator(
    'input:not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),textarea',
  );
}

async function fillField(root, ordinal, value) {
  const fields = await editableFields(root);
  const count = await fields.count();
  let selected = 0;
  for (let index = 0; index < count; index += 1) {
    const field = fields.nth(index);
    if ((await field.isDisabled()) || (await field.getAttribute("readonly")) !== null) {
      continue;
    }
    if (selected === ordinal) {
      await field.fill(value);
      return;
    }
    selected += 1;
  }
  throw new Error(`editable field ${ordinal} is missing`);
}

const browser = await chromium.launch({ headless: true });
const evidence = [];

try {
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(baseUrl, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    assert(response?.ok(), `navigation returned ${response?.status()}`);
    const root = await recorder(page);
    const controls = await statusControls(root);
    assert(controls.length === 19, `expected 19 result controls, found ${controls.length}`);
    assert(controls.every((item) => !item.disabled), "a physical test result is locked");
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);

    await fillField(root, 0, "Focused audit operator");
    await fillField(root, 2, "wifiPassword=NeverExportThis-4a91 token=NeverExportThis-4a91");
    const downloadPromise = page.waitForEvent("download");
    await root.getByRole("button", { name: /JSON/u }).first().click();
    const download = await downloadPromise;
    const reportPath = path.join(outputDirectory, await download.suggestedFilename());
    await download.saveAs(reportPath);
    const reportText = await fs.readFile(reportPath, "utf8");
    assert(reportText.includes(expectedSha), "candidate SHA is absent from exported JSON");
    assert(!reportText.includes("NeverExportThis-4a91"), "secret leaked into exported JSON");

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await recorder(page);
    await page.screenshot({
      path: path.join(outputDirectory, "offline-recorder.png"),
      fullPage: true,
    });
    evidence.push({
      check: "production-recorder-export-offline",
      result: "PASS",
      statusControls: controls.length,
      report: path.basename(reportPath),
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
    await context.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (String(key).includes("physical-acceptance")) {
          throw new DOMException("Synthetic quota exhausted", "QuotaExceededError");
        }
        return original.call(this, key, value);
      };
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    const root = await recorder(page);
    await fillField(root, 0, "Persistence failure operator");
    await page.waitForTimeout(300);
    assert(
      /تعذر الحفظ المحلي|فشل.*حفظ|مساحة.*تخزين/u.test((await root.textContent()) ?? ""),
      "local persistence failure is silent",
    );
    evidence.push({ check: "visible-storage-failure", result: "PASS" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
    const first = await context.newPage();
    const second = await context.newPage();
    await Promise.all([
      first.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 }),
      second.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 }),
    ]);
    const firstRoot = await recorder(first);
    const secondRoot = await recorder(second);
    await fillField(firstRoot, 0, "TAB-A");
    await first.waitForTimeout(250);
    await fillField(secondRoot, 0, "TAB-B");
    await second.waitForTimeout(250);
    await fillField(firstRoot, 1, "A-LATE-WRITE");
    await first.waitForTimeout(300);
    await second.reload({ waitUntil: "networkidle" });
    const reloaded = await recorder(second);
    const values = await (await editableFields(reloaded)).evaluateAll((fields) =>
      fields.map((field) => field.value),
    );
    assert(values.includes("TAB-B"), `newer operator value was lost: ${JSON.stringify(values)}`);
    assert(!values.includes("TAB-A"), `stale tab overwrote the newer operator value: ${JSON.stringify(values)}`);
    evidence.push({ check: "cross-tab-synchronization", result: "PASS" });
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(
  path.join(outputDirectory, "focused-browser-audit.json"),
  JSON.stringify({ candidateSha: expectedSha, checks: evidence }, null, 2),
);
console.log(`Focused browser audit passed for ${expectedSha}`);
