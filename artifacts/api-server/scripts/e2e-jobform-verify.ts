/* Authenticated browser check for the Job Builder and unified workspace.
 * Only short-lived test jobs created by this script may be written, and each
 * is deleted before exit. The supported development login proof is short-lived.
 */
import { launchBrowser } from "../src/lib/launchBrowser";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import fs from "node:fs";
import type { HTTPRequest, Page } from "puppeteer";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-shots";
const baseUrl = new URL(BASE);
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT
  || baseUrl.protocol !== "http:"
  || !["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname.replace(/^\[|\]$/g, ""))) {
  throw new Error(`Refusing authenticated Job Builder verification against non-local target ${baseUrl.origin}`);
}

const results: { name: string; pass: boolean; detail: string }[] = [];
const createdJobIds = new Set<number>();
const allowedDeleteJobIds = new Set<number>();
const allowedWrites: string[] = [];
let allowTestJobCreate = false;
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

async function clickWorkflowChoice(page: Page, text: string): Promise<boolean> {
  return page.evaluate(label => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>(".fixed.inset-0.z-50 button"));
    const button = buttons.find(element => (element.innerText || "").includes(label));
    button?.click();
    return Boolean(button);
  }, text);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launchBrowser();
  let sessionId: string | undefined;
  const blockedWrites: string[] = [];
  let page: Page | undefined;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 400, height: 720, isMobile: true, hasTouch: true });
    await page.setRequestInterception(true);
    page.on("request", (request: HTTPRequest) => {
      if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) {
        void request.continue();
        return;
      }
      const requestUrl = new URL(request.url());
      const requestPath = requestUrl.pathname.replace(/\/$/, "");
      if (allowTestJobCreate && request.method() === "POST" && requestPath === "/api/jobs") {
        allowedWrites.push(`${request.method()} ${requestPath}`);
        void request.continue();
        return;
      }
      const deleteMatch = requestPath.match(/^\/api\/jobs\/(\d+)$/);
      if (request.method() === "DELETE" && deleteMatch && allowedDeleteJobIds.has(Number(deleteMatch[1]))) {
        allowedWrites.push(`${request.method()} ${requestPath}`);
        void request.continue();
        return;
      }
      blockedWrites.push(`${request.method()} ${request.url()}`);
      void request.abort("blockedbyclient");
    });
    page.on("response", response => {
      const request = response.request();
      if (request.method() !== "POST" || new URL(response.url()).pathname.replace(/\/$/, "") !== "/api/jobs" || !response.ok()) return;
      void response.json().then((created: { id?: number }) => {
        if (Number.isSafeInteger(created.id)) createdJobIds.add(created.id!);
      }).catch(() => undefined);
    });

    const returnTo = "/jobs";
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development test login did not create a session");

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
    const clickedProd = await clickWorkflowChoice(page, "MH Production");
    record("'MH Production' selected", clickedProd);
    await sleep(1200);
    await page.screenshot({ path: `${SHOTS}/03-create-dialog.png` });

    const mfhOptions = await page.evaluate(async () => {
      const manufacturers = await fetch("/api/mfh/manufacturers").then(response => response.json());
      const manufacturer = Array.isArray(manufacturers) ? manufacturers.find(row => row.active) : null;
      if (!manufacturer) return null;
      const models = await fetch(`/api/mfh/models?manufacturerId=${manufacturer.id}`).then(response => response.json());
      const model = Array.isArray(models) ? models.find(row => row.active !== false) : null;
      return model ? { manufacturerName: manufacturer.name, modelName: model.name } : null;
    });
    if (mfhOptions) {
      const referenceInputs = await page.$$('form input[placeholder="Search or type to add…"]');
      if (referenceInputs.length >= 2) {
        await referenceInputs[0].type(mfhOptions.manufacturerName);
        await sleep(250);
        const selectedManufacturer = await page.evaluate((name) => {
          const option = Array.from(document.querySelectorAll<HTMLElement>("form .absolute button"))
            .find(element => (element.textContent ?? "").trim() === name);
          option?.click();
          return Boolean(option);
        }, mfhOptions.manufacturerName);
        await sleep(500);
        await referenceInputs[1].type(mfhOptions.modelName);
        await sleep(250);
        const selectedModel = await page.evaluate((name) => {
          const option = Array.from(document.querySelectorAll<HTMLElement>("form .absolute button"))
            .find(element => (element.textContent ?? "").trim() === name);
          option?.click();
          return Boolean(option);
        }, mfhOptions.modelName);
        await sleep(250);
        const selectedValues = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLInputElement>(
          'form input[placeholder="Search or type to add…"]',
        )).map(input => input.value));
        record("Existing manufacturer and model can be selected",
          selectedManufacturer && selectedModel
            && selectedValues[0] === mfhOptions.manufacturerName
            && selectedValues[1] === mfhOptions.modelName,
          selectedValues.join(" · "));
      } else record("Existing manufacturer and model can be selected", false, "reference inputs not found");
    } else {
      console.log("SKIP: Manufacturer/model selection — the development database has no active model fixture.");
    }

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

    // 7. The guided flow keeps direct access to every section without a schedule step.
    const creationSections = await page.evaluate(() => {
      const text = document.querySelector("form")?.innerText ?? "";
      const dateInputs = document.querySelectorAll('form input[type="date"]').length;
      return {
        details: text.includes("Job information"),
        customer: text.includes("Customer & location"),
        work: text.includes("Work & services"),
        subcontractors: text.includes("Subcontractors"),
        review: text.includes("Before you save"),
        wizard: text.includes("Create this job in a few steps") || text.includes("Next: Customer"),
        schedule: /\bSchedule\b|Start Date|End Date/.test(text) || dateInputs > 0,
      };
    });
    record("Creation presents all existing fields in labeled sections",
      creationSections.details && creationSections.customer && creationSections.work
      && creationSections.subcontractors && creationSections.review);
    record("Multi-step wizard navigation is absent", !creationSections.wizard);
    record("Job scheduling step and date inputs are absent", !creationSections.schedule);
    await page.screenshot({ path: `${SHOTS}/06-guided-sections.png` });

    // 8. Open a real existing job without changing it and verify both former
    // workspace views now render together without tab navigation.
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(1000);
    const existingJobButton = await page.$('button[data-testid^="job-card-open-"]');
    if (!existingJobButton) {
      record("Existing job workspace opens", false, "No visible job card was available");
    } else {
      await existingJobButton.click();
      await page.waitForSelector('[data-testid^="job-workspace-unified-"]', { timeout: 15_000 });
      const workspaceState = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[data-testid^="job-workspace-unified-"]');
        return {
          unified: !!root,
          overview: !!root?.querySelector('[data-testid^="job-workspace-overview-"]'),
          management: !!root?.querySelector('[data-testid^="job-workspace-job-"]'),
          tabs: !!document.querySelector('[role="tablist"][aria-label="Job workspace"]'),
          sections: ["details", "work", "subcontractors", "materials", "financials", "photos", "closeout"]
            .map(id => !!root?.querySelector(`[data-testid^="job-section-${id}-"]`)),
          retiredWorkday: !!root?.querySelector('[data-testid^="job-workspace-schedule-"]')
            || /Start Work Today|Done for Today|Daily work history/.test(root?.innerText ?? ""),
        };
      });
      record("Existing job opens the unified workspace",
        workspaceState.unified && workspaceState.overview && workspaceState.management);
      record("Former workspace tabs are removed", !workspaceState.tabs);
      record("All seven direct job sections remain accessible", workspaceState.sections.every(Boolean));
      record("Retired workday interface is absent", !workspaceState.retiredWorkday);
      await page.screenshot({ path: `${SHOTS}/07-unified-job-workspace.png` });
    }

    // 9. Create disposable development-only jobs through the real form and
    // confirm each opens in the same workspace. Cleanup uses exact IDs only.
    const workflows = [
      { key: "mh_production", label: "MH Production" },
      { key: "mh_service", label: "MH Service" },
      { key: "general_contracting", label: "General Contracting" },
    ];
    for (const workflow of workflows) {
      await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
      await clickByText(page, "button", "New Job");
      await sleep(250);
      const choseWorkflow = await clickWorkflowChoice(page, workflow.label);
      const title = `E2E disposable ${workflow.key} ${Date.now()}`;
      const titleInput = await page.$('form input[placeholder="e.g. Farm House Renovation"]');
      if (titleInput) await titleInput.type(title);
      await page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('form select');
        if (!select || select.value) return;
        const firstBusiness = Array.from(select.options).find(option => option.value);
        if (!firstBusiness) return;
        select.value = firstBusiness.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      allowTestJobCreate = true;
      const submit = await clickByText(page, "form button", "Create Job");
      if (submit) {
        try {
          await page.waitForFunction(
            () => !!document.querySelector('[data-testid^="job-workspace-unified-"]'),
            { timeout: 20_000 },
          );
        } catch {
          // The result is recorded below with enough context to diagnose.
        }
      }
      allowTestJobCreate = false;
      await sleep(300);
      const createdId = [...createdJobIds].at(-1);
      const openedInWorkspace = await page.evaluate(() => {
        const unified = document.querySelector<HTMLElement>('[data-testid^="job-workspace-unified-"]');
        return !!unified && !!unified.querySelector('[data-testid^="job-workspace-overview-"]')
          && !!unified.querySelector('[data-testid^="job-workspace-job-"]');
      });
      const creationFeedback = await page.evaluate(() => document.body.innerText.slice(-900));
      record(`${workflow.label} creation opens the unified workspace`,
        choseWorkflow && !!titleInput && submit && !!createdId && openedInWorkspace,
        createdId ? `job ${createdId}` : `creation did not return a job ID; ${creationFeedback.replace(/\n/g, " | ")}`);
      if (!createdId) await page.screenshot({ path: `${SHOTS}/failed-${workflow.key}-create.png` });
      if (createdId) {
        allowedDeleteJobIds.add(createdId);
        await page.evaluate(() => {
          const close = document.querySelector<HTMLElement>('[aria-label="Close job workspace"]');
          close?.click();
        });
        await sleep(250);
        const cleanup = await page.evaluate(async id => {
          const response = await fetch(`/api/jobs/${id}`, { method: "DELETE", credentials: "include" });
          return { ok: response.ok, status: response.status };
        }, createdId);
        allowedDeleteJobIds.delete(createdId);
        record(`${workflow.label} test job was removed`, cleanup.ok, `HTTP ${cleanup.status}`);
        createdJobIds.delete(createdId);
      }
    }
  } finally {
    allowTestJobCreate = false;
    for (const id of createdJobIds) {
      allowedDeleteJobIds.add(id);
      try {
        if (page) {
          await page.evaluate(async jobId => {
            await fetch(`/api/jobs/${jobId}`, { method: "DELETE", credentials: "include" });
          }, id);
        }
      } catch {
        blockedWrites.push(`cleanup failed for temporary job ${id}`);
      }
      allowedDeleteJobIds.delete(id);
    }
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    await browser.close();
  }

  record(
    "Browser writes stayed within the disposable-job allowlist",
    blockedWrites.length === 0 && allowedWrites.every(write => write.startsWith("POST /api/jobs") || /^DELETE \/api\/jobs\/\d+$/.test(write)),
    `allowed=${allowedWrites.length}; blocked=${blockedWrites.join("; ") || "none"}`,
  );
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
