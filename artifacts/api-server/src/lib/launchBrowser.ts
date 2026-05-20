import puppeteer, { Browser } from "puppeteer";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function resolveChromiumPath(): string {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  // Prefer the bundled Chromium that ships with the `puppeteer` package — it is
  // version-matched and known to launch correctly in containerised environments.
  // The Nix system binary (found via `which chromium`) passes the existence check
  // but cannot start its DevTools WebSocket in the production container.
  const bundled = puppeteer.executablePath();
  if (bundled && existsSync(bundled)) return bundled;

  try {
    const nixChrome = execSync("which chromium", { encoding: "utf8" }).trim();
    if (nixChrome && existsSync(nixChrome)) return nixChrome;
  } catch {}

  return bundled; // last resort — let puppeteer surface the error itself
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
