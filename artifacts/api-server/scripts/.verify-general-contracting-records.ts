import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = "http://localhost:80";
const writes: string[] = [];
const apiSnapshots: Array<{ url: string; status: number; rows: any[] }> = [];

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) throw new Error("Refusing production");
  const browser = await launchBrowser();
  let sid: string | undefined;
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) void request.continue();
      else { writes.push(`${request.method()} ${request.url()}`); void request.abort("blockedbyclient"); }
    });
    page.on("response", async response => {
      if (!response.url().includes("/api/jobs?") || response.request().method() !== "GET") return;
      try {
        const rows = await response.json();
        if (Array.isArray(rows)) apiSnapshots.push({ url: response.url(), status: response.status(), rows });
      } catch { /* Ignore non-JSON job endpoints. */ }
    });
    await page.evaluateOnNewDocument(() => localStorage.setItem("buildpro_selection_mode", "1"));
    const returnTo = "/jobs";
    const params = new URLSearchParams({ returnTo, ...createTestLoginProof(returnTo) });
    await page.goto(`${BASE}/api/dev-test-login?${params}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sid = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sid) throw new Error("Development test session was not created");
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(() => document.body.innerText.includes("Not started"), { timeout: 30_000 });
    await page.waitForFunction(() => document.body.innerText.includes("Awaiting Payment") || document.body.innerText.includes("Closed Jobs"), { timeout: 30_000 });
    const initial = await page.$$eval('[data-testid^="job-card-open-"]', elements => elements.length);
    const sectionLabels = await page.$$eval("button", buttons => buttons.map(button => button.innerText.replace(/\s+/g, " ").trim()).filter(text => /Awaiting Payment|Paid \(|Closed Jobs/.test(text)));
    await page.evaluate(() => {
      for (const label of ["Awaiting Payment", "Paid", "Closed Jobs"]) {
        const button = [...document.querySelectorAll("button")].find(candidate => candidate.innerText.includes(label));
        button?.click();
      }
    });
    await new Promise(resolve => setTimeout(resolve, 2_000));
    const renderedIds = await page.$$eval('[data-testid^="job-card-open-"]', elements => elements.map(element => Number(element.getAttribute("data-testid")?.replace("job-card-open-", ""))).filter(Number.isFinite));
    const rows = apiSnapshots.sort((a,b) => b.rows.length-a.rows.length)[0];
    const apiIds = [...new Set(rows?.rows.map(row => Number(row.id)) ?? [])].sort((a,b)=>a-b);
    const shownIds = [...new Set(renderedIds)].sort((a,b)=>a-b);
    console.log(JSON.stringify({ url: rows?.url, apiStatus: rows?.status, apiCount: apiIds.length, apiIdRange: [apiIds[0],apiIds.at(-1)], initialRenderedCardCount: initial, sectionLabels, expandedRenderedCardCount: shownIds.length, missingFromRendered: apiIds.filter(id=>!shownIds.includes(id)), unexpectedRenderedIds: shownIds.filter(id=>!apiIds.includes(id)), apiBusinessLines: [...new Set(rows?.rows.map(row=>row.businessLine))], apiBusinessIds: [...new Set(rows?.rows.map(row=>row.businessId))], apiSample: rows?.rows.slice(0,3).map(({id,title,clientId,clientName,status,workflow,businessLine,businessId})=>({id,title,clientId,clientName,status,workflow,businessLine,businessId})), writes, bodyTail: (await page.$eval("body",element=>element.innerText)).slice(-1200) }));
  } finally { if (sid) await deleteSession(sid).catch(()=>undefined); await browser.close(); }
}
main().catch(error=>{console.error(error);process.exit(1);});
