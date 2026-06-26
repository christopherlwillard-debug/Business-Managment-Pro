import puppeteer, { Browser } from "puppeteer";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function resolveChromiumPath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const p = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (existsSync(p)) {
      console.log(`[launchBrowser] Using PUPPETEER_EXECUTABLE_PATH: ${p}`);
      return p;
    }
  }

  // Prefer the bundled Chrome that Puppeteer downloaded — it is version-matched
  // and known to work. System Chromium may be a different version and incompatible.
  try {
    const bundled = puppeteer.executablePath();
    if (bundled && existsSync(bundled)) {
      console.log(`[launchBrowser] Using bundled Chrome: ${bundled}`);
      return bundled;
    }
  } catch {}

  // Fall back to system Chromium via login shell (Nix profile)
  for (const cmd of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    try {
      const p = execSync(`bash -l -c 'which ${cmd}'`, { encoding: "utf8", timeout: 5000 }).trim();
      if (p && existsSync(p)) {
        console.log(`[launchBrowser] Falling back to system chromium: ${p}`);
        return p;
      }
    } catch {}
  }

  // Direct Nix store paths as additional fallback
  const nixPaths = [
    "/home/runner/.nix-profile/bin/chromium",
    "/nix/var/nix/profiles/default/bin/chromium",
    "/run/current-system/sw/bin/chromium",
  ];
  for (const p of nixPaths) {
    if (existsSync(p)) {
      console.log(`[launchBrowser] Falling back to Nix store chromium: ${p}`);
      return p;
    }
  }

  throw new Error("No Chromium/Chrome executable found. Cannot generate PDF.");
}

const ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-zygote",
  "--no-first-run",
  "--disable-extensions",
  "--disable-features=VizDisplayCompositor",
];

export async function launchBrowser(): Promise<Browser> {
  const execPath = resolveChromiumPath();
  return puppeteer.launch({ executablePath: execPath, headless: true, args: ARGS });
}
