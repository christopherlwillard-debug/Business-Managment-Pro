import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const sourceDir = path.join(appDir, "src");
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const testFilePattern = /\.(?:test|spec)\.[^.]+$/;

/**
 * Keep this list next to the repository-wide scan so new profit consumers are
 * easy to discover and review. The scanner still checks every source file:
 * files outside this list must not create a second profit request path.
 */
export const approvedProfitClientConsumers = [
  "src/pages/Jobs.tsx",
  "src/pages/JobPayroll.tsx",
  "src/pages/RoutePlanner.tsx",
];

const directProfitUrlPattern =
  /[`'"](?:\$\{[^}]+\})?\/(?:api\/)?jobs\/(?:\$\{[^}]+\}\/)?profit(?:-summary)?(?:[?`'"]|\/)/;
const generatedProfitUrlPattern =
  /\bget(?:GetJobProfitUrl|GetJobsProfitSummaryUrl)\s*\(/;
const localProfitCastPattern =
  /\b(?:getJobProfit|getJobsProfitSummary|getGetJobProfitUrl|getGetJobsProfitSummaryUrl)\s*\([\s\S]{0,240}?\bas\s+(?:unknown\s+as\s+)?(?:JobProfitResponse|GetJobsProfitSummary200|Record|Promise)\b/;
const localProfitJsonPattern =
  /\b(?:fetch|apiFetch)\s*\([\s\S]{0,320}?(?:profit-summary|\/profit(?:[/?`'"]|$)|get(?:GetJobProfitUrl|GetJobsProfitSummaryUrl))[\s\S]{0,320}?(?:\.json\s*\(\)|\bas\s+(?:unknown\s+as\s+)?(?:JobProfitResponse|GetJobsProfitSummary200|Record|Promise)\b)/;

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function addViolation(violations, relativePath, source, index, message) {
  const line = lineNumberAt(source, index);
  const snippet = source.split("\n")[line - 1]?.trim() ?? "";
  violations.push(`${relativePath}:${line}: ${message}${snippet ? `\n  ${snippet}` : ""}`);
}

function collectSourceFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(fullPath);
      if (!sourceExtensions.has(path.extname(entry.name)) || testFilePattern.test(entry.name)) {
        return [];
      }
      return [path.relative(appDir, fullPath).replaceAll(path.sep, "/")];
    })
    .sort();
}

export function listProfitClientSourceFiles() {
  return collectSourceFiles(sourceDir);
}

export function findProfitClientViolations(relativePath, source) {
  const violations = [];

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
  return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceFiles = listProfitClientSourceFiles();
  const violations = sourceFiles.flatMap((relativePath) =>
    findProfitClientViolations(
      relativePath,
      fs.readFileSync(path.join(appDir, relativePath), "utf8"),
    ),
  );

  if (violations.length > 0) {
    console.error("[job-profit-client] validation failed:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log(
      `[job-profit-client] passed: scanned ${sourceFiles.length} frontend source files; ` +
      `approved profit consumers: ${approvedProfitClientConsumers.join(", ")}`,
    );
  }
}