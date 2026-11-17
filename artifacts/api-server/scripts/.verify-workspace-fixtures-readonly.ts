import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = "http://localhost:80";
const jobIds = [2538, 2539];
const unexpectedWrites: string[] = [];
const results: Record<string, unknown>[] = [];

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
    throw new Error("Refusing to run against production");
  }
  const browser = await launchBrowser();
  let sid: string | undefined;
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) void request.continue();
      else {
        unexpectedWrites.push(`${request.method()} ${request.url()}`);
        void request.abort("blockedbyclient");
      }
    });
    await page.evaluateOnNewDocument(() => localStorage.setItem("buildpro_selection_mode", "1"));
    const returnTo = "/jobs";
    const proof = createTestLoginProof(returnTo);
    const params = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${params}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sid = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sid) throw new Error("Could not create the short-lived development test session");

    async function openJob(id: number) {
      await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
      const row = `[data-testid="compact-job-row-${id}"]`;
      await page.waitForSelector(row, { timeout: 30_000 });
      await page.$eval(row, element => {
        const button = element.querySelector('button[data-testid^="job-card-open-"]') as HTMLButtonElement | null;
        if (!button) throw new Error("Open job control missing from compact row");
        button.click();
      });
      await page.waitForSelector(`[data-testid="job-workspace-unified-${id}"]`, { timeout: 20_000 });
    }

    async function clickOverviewAction(id: number, label: string) {
      await page.evaluate(({ id, label }) => {
        const root = document.querySelector(`[data-testid="job-workspace-overview-${id}"]`);
        const button = [...(root?.querySelectorAll("button") ?? [])]
          .find(candidate => candidate.textContent?.replace(/\s+/g, " ").trim().includes(label));
        if (!button) throw new Error(`Workspace action not found: ${label}`);
        button.click();
      }, { id, label });
    }

    for (const id of jobIds) {
      await openJob(id);
      await clickOverviewAction(id, "Materials");
      await page.waitForFunction(() => document.body.innerText.includes("Material Lists"), { timeout: 25_000 });
      const materialsText = await page.$eval("body", element => element.innerText.replace(/\s+/g, " ").trim());
      const listApi = await page.evaluate(async jobId => {
        const response = await fetch(`/api/material-lists?jobId=${jobId}`, { credentials: "include" });
        return { status: response.status, body: await response.text() };
      }, id);
      await page.evaluate(() => {
        [...document.querySelectorAll("button")].find(button => button.textContent?.includes("New Material List"))?.click();
      });
      await page.waitForFunction(() => document.body.innerText.includes("Add from Catalog"), { timeout: 20_000 });
      const catalog = await page.$eval("body", element => element.innerText.replace(/\s+/g, " ").trim());
      const addButtons = await page.$$eval("button", buttons => buttons.filter(button => button.className.includes("bg-amber-500") && button.textContent?.trim() === "").length);
      results.push({ jobId: id, panel: "materials", existingListVisible: materialsText.includes("Temporary materials"), fixtureItemVisible: materialsText.includes("Temporary fixture item"), catalogPanelVisible: catalog.includes("Add from Catalog"), catalogAddChoices: addButtons, listApiStatus: listApi.status, listApiPreview: listApi.body.slice(0, 500) });

      await openJob(id);
      await clickOverviewAction(id, "Open checklist");
      await page.waitForFunction(() => document.body.innerText.includes("evidence checklist"), { timeout: 25_000 });
      await page.evaluate(() => {
        [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Temporary verification section"))?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 1_000));
      const checklistText = await page.$eval("body", element => element.innerText.replace(/\s+/g, " ").trim());
      const checklistImages = await page.$$eval("img", images => images.map(image => ({ loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth })).filter(image => image.loaded).length);
      results.push({ jobId: id, panel: "checklist", checklistVisible: checklistText.includes("evidence checklist"), itemVisible: checklistText.includes("Temporary evidence item"), startPhotosVisible: checklistText.includes("Start-of-Job Photos"), finishedPhotosVisible: checklistText.includes("Finished Photos"), evidenceCaptionVisible: checklistText.includes("Temporary verification image"), loadedImages: checklistImages, preview: checklistText.slice(-1000) });

      await openJob(id);
      await clickOverviewAction(id, "Photos & Documents");
      await page.waitForFunction(() => document.body.innerText.includes("Log History") && document.body.innerText.includes("Temporary work completed record"), { timeout: 25_000 });
      const dailyLogText = await page.$eval("body", element => element.innerText.replace(/\s+/g, " ").trim());
      const logImages = await page.$$eval("img", images => images.map(image => ({ loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth })).filter(image => image.loaded).length);
      results.push({ jobId: id, panel: "photos-documents-history", dailyLogVisible: dailyLogText.includes("Temporary work completed record"), fixturePhotoVisible: dailyLogText.includes("Temporary photo and history fixture"), loadedImages: logImages });
    }
    if (unexpectedWrites.length) throw new Error(`Blocked unexpected writes: ${unexpectedWrites.join("; ")}`);
    console.log(JSON.stringify({ results, unexpectedWrites: 0 }));
  } finally {
    if (sid) await deleteSession(sid).catch(() => undefined);
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
