import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const targetFiles = [
  "src/pages/Jobs.tsx",
  "src/pages/JobPayroll.tsx",
];

const directProfitUrlPattern =
  /[`'"](?:\$\{[^}]+\})?\/(?:api\/)?jobs\/(?:\$\{[^}]+\}\/)?profit(?:-summary)?(?:[?`'"]|\/)/;
const generatedProfitUrlPattern =
  /\bget(?:GetJobProfitUrl|GetJobsProfitSummaryUrl)\s*\(/;
const localProfitCastPattern =
  /\b(?:getJobProfit|getJobsProfitSummary|getGetJobProfitUrl|getGetJobsProfitSummaryUrl)\s*\([\s\S]{0,240}?\bas\s+(?:unknown\s+as\s+)?(?:JobProfitResponse|GetJobsProfitSummary200|Record|Promise)\b/;
const localProfitJsonPattern =
  /\b(?:fetch|apiFetch)\s*\([\s\S]{0,320}?(?:profit-summary|\/profit|get(?:GetJobProfitUrl|GetJobsProfitSummaryUrl))[\s\S]{0,320}?(?:\.json\s*\(\)|\bas\s+(?:unknown\s+as\s+)?(?:JobProfitResponse|GetJobsProfitSummary200|Record|Promise)\b)/;

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function addViolation(violations, relativePath, source, index, message) {
  const line = lineNumberAt(source, index);
  const snippet = source.split("\n")[line - 1]?.trim() ?? "";
  violations.push(`${relativePath}:${line}: ${message}${snippet ? `\n  ${snippet}` : ""}`);
}

const violations = [];

for (const relativePath of targetFiles) {
  const absolutePath = path.join(appDir, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  const directUrlMatch = directProfitUrlPattern.exec(source);
  if (directUrlMatch) {
    addViolation(
      violations,
      relativePath,
      source,
      directUrlMatch.index,
      "build profit requests through the generated API client instead of a raw URL",
    );
  }

  const generatedUrlMatch = generatedProfitUrlPattern.exec(source);
  if (generatedUrlMatch) {
    addViolation(
      violations,
      relativePath,
      source,
      generatedUrlMatch.index,
      "use getJobProfit/getJobsProfitSummary rather than constructing generated URLs locally",
    );
  }

  const localCastMatch = localProfitCastPattern.exec(source);
  if (localCastMatch) {
    addViolation(
      violations,
      relativePath,
      source,
      localCastMatch.index,
      "do not cast the response from a profit route locally; use the generated client contract",
    );
  }

  const localJsonMatch = localProfitJsonPattern.exec(source);
  if (localJsonMatch) {
    addViolation(
      violations,
      relativePath,
      source,
      localJsonMatch.index,
      "do not parse and cast a profit response locally; use the generated client method",
    );
  }
}

if (violations.length > 0) {
  console.error("[job-profit-client] validation failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `[job-profit-client] passed: ${targetFiles.join(", ")} use generated profit client methods without local route casts`,
  );
}