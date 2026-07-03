/* One-off verification script for Task #1078: mobile Create Job flow.
 * Run: SID=<session-id> pnpm --filter @workspace/api-server exec tsx scripts/e2e-jobform-verify.ts
 */
import { launchBrowser } from "../src/lib/launchBrowser";
import fs from "node:fs";
import type { Page } from "puppeteer";

const BASE = "http://localhost:80";
const SHOTS = "/tmp/e2e-shots";
const SID = process.env.SID;
if (!SID) {
  console.error("FATAL: SID env var required");
  process.exit(1);
}

const results: { name: string; pass: boolean; detail: string }[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

async function clickByText(page: Page, selector: string, text: string): Promise<boolean> {
  return page.evaluate(
    (sel, txt) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
      const el = els.find(e => (e.textContent || "").trim().includes(txt));
      if (el) {
        el.click();
        return true;
      }
      return false;
    },
    selector,
    text,
  );
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 720, isMobile: true, hasTouch: true });
    await page.setCookie({ name: "sid", value: SID!, domain: "localhost", path: "/" });

    // 1. Load /jobs authenticated
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(1500);
    const bodyText = await page.evaluate(() => document.body.innerText);
    const loggedIn = !/log in|sign in/i.test(bodyText.slice(0, 400)) && /job/i.test(bodyText);
    record("Authenticated Jobs page loads at 400px", loggedIn, bodyText.slice(0, 80).replace(/\n/g, " | "));
    await page.screenshot({ path: `${SHOTS}/01-jobs-page.png` });

    // 2. Open New Job
    const clickedNew = await clickByText(page, "button", "New Job");
    record("'New Job' button found and clicked", clickedNew);
    await sleep(800);
    await page.screenshot({ path: `${SHOTS}/02-workflow-picker.png` });

    // 3. Workflow picker -> MH Production
    const pickerVisible = await page.evaluate(() =>
      document.body.innerText.includes("Choose the type of work"),
    );
    record("Workflow picker shown", pickerVisible);
    const clickedProd = await clickByText(page, "button", "MH Production");
    record("'MH Production' selected", clickedProd);
    await sleep(1200);
    await page.screenshot({ path: `${SHOTS}/03-create-dialog.png` });

    // 4. Dialog fits viewport, form area scrolls internally
    const scrollInfo = await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>(".fixed.inset-0.z-50 .relative.w-full.bg-card");
      const sc = document.querySelector<HTMLElement>("form .overflow-y-auto");
      if (!dialog || !sc) return null;
      const rect = dialog.getBoundingClientRect();
      return {
        dialogTop: rect.top,
        dialogBottom: rect.bottom,
        viewportH: window.innerHeight,
        scScrollHeight: sc.scrollHeight,
        scClientHeight: sc.clientHeight,
      };
    });
    if (!scrollInfo) {
      record("Create dialog + scroll container present", false, "not found");
    } else {
      record(
        "Dialog fits within 720px viewport",
        scrollInfo.dialogBottom <= scrollInfo.viewportH + 1 && scrollInfo.dialogTop >= -1,
        `top=${scrollInfo.dialogTop.toFixed(0)} bottom=${scrollInfo.dialogBottom.toFixed(0)} vh=${scrollInfo.viewportH}`,
      );
      record(
        "Form body scrolls internally (content overflows)",
        scrollInfo.scScrollHeight > scrollInfo.scClientHeight,
        `scrollH=${scrollInfo.scScrollHeight} clientH=${scrollInfo.scClientHeight}`,
      );
    }

    // 5. Scroll to Services Included and inspect list
    await page.evaluate(() => {
      const sc = document.querySelector<HTMLElement>("form .overflow-y-auto");
      const label = Array.from(document.querySelectorAll<HTMLElement>("form label")).find(l =>
        (l.textContent || "").includes("Services Included"),
      );
      if (sc && label) sc.scrollTop = label.offsetTop - 60;
    });
    await sleep(500);
    await page.screenshot({ path: `${SHOTS}/04-services-section.png` });

    const services = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll<HTMLElement>("form label"));
      const section = labels.find(l => (l.textContent || "").includes("Services Included"));
      const container = section?.parentElement?.querySelector(".rounded-xl.border");
      if (!container) return null;
      const rows = Array.from(container.querySelectorAll<HTMLElement>(".group"));
      return rows.map(r => ({
        name: r.querySelector("span.text-sm")?.textContent?.trim() ?? "",
        hasPencil: !!r.querySelector('button[title="Edit service"]'),
      }));
    });
    if (!services) {
      record("Services Included section found", false);
    } else {
      const names = services.map(s => s.name);
      const expectProd = ["Interior Trim", "Exterior Trim", "Plumbing Hookup", "Skirting", "Steps"];
      const banned = ["Service Call", "Mileage", "Materials", "Warranty Repair"];
      record(
        "Production services listed",
        expectProd.every(n => names.includes(n)),
        names.join(", "),
      );
      record(
        "Service-only items excluded",
        banned.every(n => !names.includes(n)),
        `banned present: ${banned.filter(n => names.includes(n)).join(", ") || "none"}`,
      );
      record("Every service row has pencil edit icon", services.every(s => s.hasPencil));
    }

    // 6. Pencil -> inline editor for Interior Trim
    const clickedPencil = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>("form .group"));
      const row = rows.find(r => (r.textContent || "").includes("Interior Trim"));
      const btn = row?.querySelector<HTMLElement>('button[title="Edit service"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    record("Pencil clicked on Interior Trim", clickedPencil);
    await sleep(500);
    await page.screenshot({ path: `${SHOTS}/05-inline-editor.png` });

    const editor = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>("form .border-amber-300.bg-amber-50\\/50");
      if (!box) return null;
      const input = box.querySelector<HTMLInputElement>('input[type="text"]');
      const btnTexts = Array.from(box.querySelectorAll("button")).map(b => (b.textContent || "").trim());
      return { inputValue: input?.value ?? "", buttons: btnTexts };
    });
    if (!editor) {
      record("Inline editor opened", false);
    } else {
      record("Inline editor prefilled with name", editor.inputValue === "Interior Trim", editor.inputValue);
      const need = ["Production", "Service only", "Save", "Cancel", "Archive"];
      record(
        "Editor has toggle + Save/Cancel/Archive",
        need.every(n => editor.buttons.some(b => b.includes(n))),
        editor.buttons.join(", "),
      );
    }
    await clickByText(page, "form button", "Cancel");
    await sleep(300);

    // 7. Empty-title submit -> error banner, scroll to top, focus title
    await page.evaluate(() => {
      const sc = document.querySelector<HTMLElement>("form .overflow-y-auto");
      if (sc) sc.scrollTop = sc.scrollHeight;
    });
    await sleep(400);
    await page.screenshot({ path: `${SHOTS}/06-scrolled-bottom.png` });
    const clickedSubmit = await clickByText(page, 'button[type="submit"]', "Create Job");
    record("'Create Job' clicked with empty title", clickedSubmit);
    await sleep(1200); // allow smooth scroll + focus

    const validation = await page.evaluate(() => {
      const sc = document.querySelector<HTMLElement>("form .overflow-y-auto");
      const banner = Array.from(document.querySelectorAll<HTMLElement>("form div")).find(
        d => d.className.includes("destructive") && (d.textContent || "").includes("Title is required"),
      );
      const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Farm House Renovation"]');
      const bannerRect = banner?.getBoundingClientRect();
      return {
        bannerFound: !!banner,
        bannerVisibleInViewport: bannerRect ? bannerRect.top >= 0 && bannerRect.bottom <= window.innerHeight : false,
        scrollTop: sc?.scrollTop ?? -1,
        titleFocused: !!title && document.activeElement === title,
        dialogStillOpen: !!document.querySelector("form .overflow-y-auto"),
      };
    });
    record("Form did NOT submit (dialog still open)", validation.dialogStillOpen);
    record("Red 'Title is required' banner shown", validation.bannerFound);
    record("Banner visible in viewport (scrolled to top)", validation.bannerVisibleInViewport, `scrollTop=${validation.scrollTop}`);
    record("Scroll container returned to top", validation.scrollTop <= 20, `scrollTop=${validation.scrollTop}`);
    record("Title input focused", validation.titleFocused);
    await page.screenshot({ path: `${SHOTS}/07-validation-error.png` });
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length) {
    console.log("FAILED:", failed.map(f => f.name).join("; "));
    process.exit(1);
  }
}

main().catch(err => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
