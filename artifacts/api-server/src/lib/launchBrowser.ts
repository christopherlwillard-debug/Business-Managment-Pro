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

  // Prefer system Chromium installed via Nix — its wrapper script sets up the
  // correct Nix store library paths so all shared libs are available.
  // The bundled Puppeteer Chrome binary requires system libs (libglib-2.0, etc.)
  // that are NOT present in the production deployment container.
  for (const cmd of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    try {
      const p = execSync(`bash -l -c 'which ${cmd}'`, { encoding: "utf8", timeout: 5000 }).trim();
      if (p && existsSync(p)) {
        console.log(`[launchBrowser] Using system chromium: ${p}`);
        return p;
      }
    } catch {}
  }

  // Direct Nix store paths
  const nixPaths = [
    "/home/runner/.nix-profile/bin/chromium",
    "/nix/var/nix/profiles/default/bin/chromium",
    "/run/current-system/sw/bin/chromium",
  ];
  for (const p of nixPaths) {
    if (existsSync(p)) {
      console.log(`[launchBrowser] Using Nix store chromium: ${p}`);
      return p;
    }
  }

  // Last resort: bundled Puppeteer Chrome (may lack system libs in some envs)
  const bundled = puppeteer.executablePath();
  console.log(`[launchBrowser] Falling back to bundled Chrome: ${bundled}`);
  return bundled;
}

const ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--disable-extensions",
  "--disable-features=VizDisplayCompositor",
];

export async function launchBrowser(): Promise<Browser> {
  const execPath = resolveChromiumPath();
  return puppeteer.launch({
    executablePath: execPath,
    headless: true,
    args: ARGS,
    protocolTimeout: 60000,
  });
}
