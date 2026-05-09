import puppeteer from "puppeteer";
import { existsSync } from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { join } from "node:path";
import app from "./app";
import { startRecurringExpensesJob } from "./jobs/recurringExpenses.js";
import { startInvoiceReminderJob } from "./jobs/invoiceReminders.js";
import { startPlaidSyncJob } from "./jobs/plaidSync.js";
import { startBidSyncJob } from "./jobs/bidSync.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureChrome(): Promise<void> {
  // Prefer system chromium installed via Nix — runs natively on NixOS without
  // library path issues that affect the puppeteer-downloaded binary.
  try {
    const nixChrome = execSync("which chromium", { encoding: "utf8" }).trim();
    if (nixChrome && existsSync(nixChrome)) {
      console.log(`Chrome (system) ready at ${nixChrome}`);
      return;
    }
  } catch {}

  // Fall back to puppeteer's downloaded Chrome (works on standard Linux).
  const execPath = puppeteer.executablePath();
  if (existsSync(execPath)) {
    console.log(`Chrome ready at ${execPath}`);
    return;
  }

  console.log(`Chrome not found — downloading now (this may take a minute)...`);
  const candidates = [
    join(process.cwd(), "node_modules/puppeteer/install.mjs"),
    join(process.cwd(), "artifacts/api-server/node_modules/puppeteer/install.mjs"),
  ];
  const installScript = candidates.find(existsSync);
  if (!installScript) {
    throw new Error(
      `Cannot find puppeteer install.mjs. Tried:\n${candidates.join("\n")}`
    );
  }
  execFileSync(process.execPath, [installScript], { stdio: "inherit" });
  console.log("Chrome download complete.");
}

async function start() {
  await ensureChrome();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startRecurringExpensesJob();
    startInvoiceReminderJob();
    startPlaidSyncJob();
    startBidSyncJob();
  });
}

start().catch((err) => {
  console.error("Server startup failed:", err);
  process.exit(1);
});
