/* One-off verification script for the trip documentation packet page.
 * Run: SID=<session-id> JOB_ID=<id> pnpm --filter @workspace/api-server exec tsx scripts/e2e-trip-packet-verify.ts
 */
import { launchBrowser } from "../src/lib/launchBrowser";
import fs from "node:fs";

const BASE = "http://localhost:80";
const SHOTS = "/tmp/e2e-shots";
const SID = process.env.SID;
const JOB_ID = process.env.JOB_ID || "18";
if (!SID) {
  console.error("FATAL: SID env var required");
  process.exit(1);
}

const results: { name: string; pass: boolean; detail: string }[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setCookie({ name: "sid", value: SID!, domain: "localhost", path: "/" });

    await page.goto(`${BASE}/trip-packet/${JOB_ID}`, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(2000);
    const text = await page.evaluate(() => document.body.innerText);

    record("Page loads authenticated (no login gate)", !/sign in to access/i.test(text));
    record("Job title shown", text.includes("TEST TRIP PACKET Job"));
    record("Client shown", text.includes("TEST Trip Client"));
    record("Travel category grouping shown", /fuel\/travel/i.test(text));
    record("Business purpose shown", text.includes("Round trip to job site, 180 miles"));
    record("Travel total shown", text.includes("349.25"));
    record("Other expenses total shown", text.includes("412.30"));
    record("Invoice TEST-9001 shown", text.includes("TEST-9001"));
    record("Paid status shown", /paid/i.test(text));
    record("Daily log content shown", text.includes("Demo complete, framing started"));
    record("No raw error state", !/something went wrong|error loading|failed to load/i.test(text));

    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button, a")).map(b => (b.textContent || "").trim())
    );
    record("Download PDF button present", buttons.some(t => /download pdf/i.test(t)));
    record("Print button present", buttons.some(t => /print/i.test(t)));

    await page.screenshot({ path: `${SHOTS}/trip-packet-top.png` });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
    await page.screenshot({ path: `${SHOTS}/trip-packet-bottom.png` });

    // Entry point: Expenses page modal
    await page.goto(`${BASE}/expenses`, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(2500);
    // Search for the test expense (month groups are collapsed by default)
    const searchSel = 'input[placeholder*="Search"]';
    await page.waitForSelector(searchSel, { timeout: 15000 });
    await page.click(searchSel);
    await page.type(searchSel, "TEST fuel", { delay: 30 });
    await sleep(1500);
    await page.screenshot({ path: `${SHOTS}/expenses-search.png` });
    // Real mouse click on the "June 2026" group header to expand it
    const hdrBox = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>("*"));
      const matches = els.filter(e => {
        const t = (e.textContent || "").trim();
        return t.startsWith("June 2026") && t.length < 120 && e.children.length < 8;
      });
      const el = matches[matches.length - 1];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (hdrBox) await page.mouse.click(hdrBox.x, hdrBox.y);
    await sleep(1200);
    await page.screenshot({ path: `${SHOTS}/expenses-expanded.png` });
    const rowBox = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>("*"));
      const matches = els.filter(e => {
        const t = (e.textContent || "");
        return t.includes("TEST fuel expense") && t.length < 300;
      });
      const el = matches[matches.length - 1];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    let clicked = false;
    if (rowBox) {
      await page.mouse.click(rowBox.x, rowBox.y);
      clicked = true;
    }
    record("Opened TEST fuel expense on Expenses page", clicked);
    await sleep(1500);
    const modalText = await page.evaluate(() => document.body.innerText);
    record("Trip Documentation panel visible in expense modal", /trip documentation/i.test(modalText));
    await page.screenshot({ path: `${SHOTS}/expense-modal.png` });
  } finally {
    await browser.close();
  }
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
