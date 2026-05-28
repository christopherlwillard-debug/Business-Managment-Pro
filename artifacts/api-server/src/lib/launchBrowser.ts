import puppeteer, { Browser } from "puppeteer";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function resolveChromiumPath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const p = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (existsSync(p)) return p;
  }

  // Login shell sources the Nix profile (~/.nix-profile/etc/profile.d/nix.sh)
  // which puts pkgs.chromium on PATH — works in both dev and deployed containers.
  for (const cmd of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    try {
      const p = execSync(`bash -l -c 'which ${cmd}'`, { encoding: "utf8", timeout: 5000 }).trim();
      if (p && existsSync(p)) {
        console.log(`[launchBrowser] Found system chromium via login shell: ${p}`);
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
    if (existsSync(p)) return p;
  }

  // Last resort: bundled puppeteer chrome
  const bundled = puppeteer.executablePath();
  console.log(`[launchBrowser] Falling back to bundled Chrome: ${bundled}`);
  return bundled;
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
