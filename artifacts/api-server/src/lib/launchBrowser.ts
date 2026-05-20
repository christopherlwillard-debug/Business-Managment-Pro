import puppeteer, { Browser } from "puppeteer";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function resolveChromiumPath(): string {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  try {
    const nixChrome = execSync("which chromium", { encoding: "utf8" }).trim();
    if (nixChrome && existsSync(nixChrome)) return nixChrome;
  } catch {}

  return puppeteer.executablePath();
}

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: resolveChromiumPath(),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
      "--no-first-run",
      "--disable-extensions",
      "--disable-features=VizDisplayCompositor",
    ],
  });
}
