import puppeteer, { Browser } from "puppeteer";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function resolveChromiumPath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (existsSync(fromEnv)) return fromEnv;
  }

  try {
    const nixChrome = execSync("which chromium", { encoding: "utf8" }).trim();
    if (nixChrome && existsSync(nixChrome)) return nixChrome;
  } catch {}

  return puppeteer.executablePath();
}

export async function launchBrowser(): Promise<Browser> {
  const executablePath = resolveChromiumPath();

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-zygote",
    "--single-process",
    "--no-first-run",
    "--disable-extensions",
    "--disable-features=VizDisplayCompositor",
  ];

  try {
    return await puppeteer.launch({ executablePath, headless: true, args });
  } catch (firstErr) {
    const bundled = puppeteer.executablePath();
    if (bundled && bundled !== executablePath && existsSync(bundled)) {
      return puppeteer.launch({ executablePath: bundled, headless: true, args });
    }
    throw firstErr;
  }
}
