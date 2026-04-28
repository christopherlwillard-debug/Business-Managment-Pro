import puppeteer from "puppeteer";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import app from "./app";
import { startRecurringExpensesJob } from "./jobs/recurringExpenses.js";

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
  const execPath = puppeteer.executablePath();
  if (existsSync(execPath)) {
    console.log(`Chrome ready at ${execPath}`);
    return;
  }
  console.log(`Chrome not found at ${execPath} — downloading now (this may take a minute)...`);
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
  });
}

start().catch((err) => {
  console.error("Server startup failed:", err);
  process.exit(1);
});
