import puppeteer, { Browser } from "puppeteer";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function resolveChromiumPath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (existsSync(fromEnv)) return fromEnv;
  }

  // Try system chromium via PATH first (works in dev with pkgs.chromium in replit.nix)
  for (const cmd of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    try {
      const p = execSync(`which ${cmd}`, { encoding: "utf8" }).trim();
      if (p && existsSync(p)) return p;
    } catch {}
  }

  // Well-known NixOS paths (deployed Replit environment)
  const nixPaths = [
    "/home/runner/.nix-profile/bin/chromium",
    "/nix/var/nix/profiles/default/bin/chromium",
    "/run/current-system/sw/bin/chromium",
    "/home/runner/.nix-profile/bin/chromium-browser",
  ];
  for (const p of nixPaths) {
    if (existsSync(p)) return p;
  }

  // Last resort: bundled puppeteer chrome
  return puppeteer.executablePath();
}

const ARGS = [
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

export async function launchBrowser(): Promise<Browser> {
  const primary = resolveChromiumPath();
  try {
    return await puppeteer.launch({ executablePath: primary, headless: true, args: ARGS });
  } catch (firstErr) {
    // If primary failed, try the bundled chrome as a last-ditch fallback
    const bundled = puppeteer.executablePath();
    if (bundled && bundled !== primary && existsSync(bundled)) {
      try {
        return await puppeteer.launch({ executablePath: bundled, headless: true, args: ARGS });
      } catch {}
    }
    throw firstErr;
  }
}
