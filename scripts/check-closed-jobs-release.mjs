#!/usr/bin/env node

/**
 * Release contract check for the canonical Closed Jobs flow.
 *
 * Local/source check:
 *   pnpm run check:closed-jobs-release
 *
 * Production build check:
 *   pnpm --filter @workspace/contractor-app run build
 *
 * Live post-publish check:
 *   CLOSED_JOBS_RELEASE_URL=https://example.replit.app \
 *     pnpm run check:closed-jobs-release -- --live
 *
 * The live probes are GET requests only. Authentication responses prove that
 * the route exists; 404/405 and server errors fail the check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendSourcePath = path.join(root, "artifacts/contractor-app/src/pages/Jobs.tsx");
const apiSourcePath = path.join(root, "artifacts/api-server/src/routes/jobs.ts");
const generatedApiPath = path.join(root, "lib/api-client-react/src/generated/api.ts");
const frontendBuildDir = path.join(root, "artifacts/contractor-app/dist/public");

const frontendSourceMarkers = [
  "getJobsProfitSummary(",
  "/api/jobs/financials-summary",
  "/api/jobs/outstanding-sub-balances",
  "/api/jobs/closed/export",
  "Closed Jobs",
];
const frontendBundleMarkers = [
  "/api/jobs/profit-summary",
  ...frontendSourceMarkers.filter((marker) => marker !== "getJobsProfitSummary("),
];
const apiMarkers = [
  'router.get("/profit-summary"',
  'router.get("/financials-summary"',
  'router.get("/outstanding-sub-balances"',
  'router.get("/closed/export"',
  "calculateJobProfit(",
];
const generatedApiMarkers = [
  "getJobsProfitSummary",
  "/api/jobs/profit-summary",
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function readRequiredFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} is missing: ${path.relative(root, filePath)}`);
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
}

function checkMarkers(label, source, markers) {
  if (source == null) return;
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(`${label} is missing required marker ${JSON.stringify(marker)}`);
    }
  }
}

function listJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(filePath);
    return entry.name.endsWith(".js") ? [filePath] : [];
  });
}

function checkWorkspaceSources({ requireBuild }) {
  checkMarkers(
    "Jobs.tsx",
    readRequiredFile(frontendSourcePath, "Jobs.tsx"),
    frontendSourceMarkers,
  );
  checkMarkers(
    "jobs.ts",
    readRequiredFile(apiSourcePath, "jobs.ts"),
    apiMarkers,
  );
  checkMarkers(
    "generated API client",
    readRequiredFile(generatedApiPath, "generated API client"),
    generatedApiMarkers,
  );

  const bundleFiles = listJavaScriptFiles(frontendBuildDir);
  if (requireBuild && bundleFiles.length === 0) {
    fail(`frontend build has no JavaScript assets: ${path.relative(root, frontendBuildDir)}`);
  }
  if (bundleFiles.length > 0) {
    const bundleSource = bundleFiles
      .map((filePath) => fs.readFileSync(filePath, "utf8"))
      .join("\n");
    checkMarkers("frontend JavaScript build", bundleSource, frontendBundleMarkers);
  }
}

function argumentValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length) || null;
}

function normalizeLiveUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Live release URL must use http or https: ${url.href}`);
  }
  return new URL(url.href.endsWith("/") ? url.href : `${url.href}/`);
}

function scriptReferences(source, baseUrl) {
  const references = new Set();
  const pattern = /["']([^"']+\.js(?:\?[^"']*)?)["']/g;
  for (const match of source.matchAll(pattern)) {
    try {
      const reference = new URL(match[1], baseUrl);
      if (reference.pathname.includes("/assets/") && reference.pathname.endsWith(".js")) {
        references.add(reference.href);
      }
    } catch {
      // Ignore source-map and unrelated string values that are not URLs.
    }
  }
  return references;
}

async function fetchLiveBundle(baseUrl) {
  const pageUrl = new URL("jobs", baseUrl);
  const pageResponse = await fetch(pageUrl);
  if (!pageResponse.ok) {
    throw new Error(`live Jobs page returned HTTP ${pageResponse.status}: ${pageUrl.href}`);
  }

  const html = await pageResponse.text();
  const assetUrls = scriptReferences(html, pageResponse.url || pageUrl.href);
  if (assetUrls.size === 0) {
    throw new Error("live Jobs page did not reference any JavaScript assets");
  }

  const visited = new Set();
  const pending = [...assetUrls];
  const bundles = [];
  while (pending.length > 0) {
    const assetUrl = pending.shift();
    if (!assetUrl || visited.has(assetUrl)) continue;
    visited.add(assetUrl);
    const response = await fetch(assetUrl);
    if (!response.ok) {
      throw new Error(`live JavaScript asset returned HTTP ${response.status}: ${assetUrl}`);
    }
    const source = await response.text();
    bundles.push(source);
    for (const reference of scriptReferences(source, assetUrl)) {
      if (!visited.has(reference)) pending.push(reference);
    }
    if (visited.size > 1000) {
      throw new Error("live asset graph exceeded 1000 JavaScript files");
    }
  }

  return bundles.join("\n");
}

async function checkLiveRelease(value) {
  const baseUrl = normalizeLiveUrl(value);
  const bundleSource = await fetchLiveBundle(baseUrl);
  checkMarkers("live frontend JavaScript bundle", bundleSource, frontendBundleMarkers);

  const routePaths = [
    "/api/jobs/profit-summary?jobIds=1",
    "/api/jobs/financials-summary",
    "/api/jobs/outstanding-sub-balances?jobIds=1",
    "/api/jobs/closed/export",
  ];
  for (const routePath of routePaths) {
    const url = new URL(routePath.slice(1), baseUrl);
    const response = await fetch(url);
    if (response.status === 404 || response.status === 405 || response.status >= 500) {
      fail(`live route is stale or unhealthy (HTTP ${response.status}): ${url.pathname}`);
    } else {
      console.log(`PASS live route present: ${url.pathname} (HTTP ${response.status})`);
    }
  }
}

async function main() {
  const requireBuild = process.argv.includes("--built");
  checkWorkspaceSources({ requireBuild });

  const liveValue = argumentValue("--live-url") || (
    process.argv.includes("--live")
      ? process.env.CLOSED_JOBS_RELEASE_URL
      : null
  );
  if (process.argv.includes("--live") && !liveValue) {
    fail("--live requires CLOSED_JOBS_RELEASE_URL or --live-url=https://...");
  }
  if (liveValue) {
    try {
      await checkLiveRelease(liveValue);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  if (failures.length > 0) {
    console.error("[closed-jobs-release] validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  const buildStatus = requireBuild ? "source and built assets" : "source contract";
  const liveStatus = liveValue ? "; live release" : "";
  console.log(`[closed-jobs-release] passed: ${buildStatus}${liveStatus}`);
}

await main();