#!/usr/bin/env node
/**
 * Verify that the canonical job-profit OpenAPI contract, generated packages,
 * and server response builder stay synchronized.
 *
 * Codegen runs entirely in a temporary directory. This check never writes to
 * the repository's generated output and never connects to a database.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiSpecDir = path.join(root, "lib", "api-spec");
const openapiPath = path.join(apiSpecDir, "openapi.yaml");

const generatedComparisons = [
  {
    label: "React client route helpers and response types",
    expected: path.join(
      root,
      "lib",
      "api-client-react",
      "src",
      "generated",
      "api.ts",
    ),
    generated: (temporaryRoot) =>
      path.join(temporaryRoot, "api-client-react", "src", "generated", "api.ts"),
  },
  {
    label: "React client profit schemas",
    expected: path.join(
      root,
      "lib",
      "api-client-react",
      "src",
      "generated",
      "api.schemas.ts",
    ),
    generated: (temporaryRoot) =>
      path.join(
        temporaryRoot,
        "api-client-react",
        "src",
        "generated",
        "api.schemas.ts",
      ),
  },
  {
    label: "Zod operation schemas",
    expected: path.join(
      root,
      "lib",
      "api-zod",
      "src",
      "generated",
      "api.ts",
    ),
    generated: (temporaryRoot) =>
      path.join(temporaryRoot, "api-zod", "src", "generated", "api.ts"),
  },
  {
    label: "Zod generated profit types",
    expected: path.join(
      root,
      "lib",
      "api-zod",
      "src",
      "generated",
      "types",
    ),
    generated: (temporaryRoot) =>
      path.join(temporaryRoot, "api-zod", "src", "generated", "types"),
    directory: true,
  },
];

function writeTemporaryConfig(temporaryRoot) {
  const clientWorkspace = path.join(temporaryRoot, "api-client-react", "src");
  const zodWorkspace = path.join(temporaryRoot, "api-zod", "src");
  const temporaryFetch = path.join(clientWorkspace, "custom-fetch.ts");

  fs.mkdirSync(clientWorkspace, { recursive: true });
  fs.mkdirSync(zodWorkspace, { recursive: true });
  fs.copyFileSync(
    path.join(root, "lib", "api-client-react", "src", "custom-fetch.ts"),
    temporaryFetch,
  );

  const configDirectory = fs.mkdtempSync(
    path.join(apiSpecDir, ".job-profit-contract-"),
  );
  const configPath = path.join(configDirectory, "config.ts");
  const quote = (value) => JSON.stringify(value);
  const config = `import { defineConfig } from "orval";

const titleTransformer = (config) => {
  config.info ??= {};
  config.info.title = "Api";
  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: ${quote(openapiPath)},
      override: { transformer: titleTransformer },
    },
    output: {
      workspace: ${quote(clientWorkspace)},
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: { includeHttpResponseReturnType: false },
        mutator: {
          path: ${quote(temporaryFetch)},
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: ${quote(openapiPath)},
      override: { transformer: titleTransformer },
    },
    output: {
      workspace: ${quote(zodWorkspace)},
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      prettier: true,
      override: {
        zod: {
          coerce: {
            query: ["boolean", "number", "string"],
            param: ["boolean", "number", "string"],
          },
        },
        useDates: true,
      },
    },
  },
});
`;

  fs.writeFileSync(configPath, config);
  return { configPath, configDirectory };
}

function runCodegen(configPath) {
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "@workspace/api-spec",
      "exec",
      "orval",
      "--config",
      configPath,
    ],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`Profit contract codegen failed.\n${output}`);
  }
}

function compareFile(expectedPath, generatedPath, label) {
  if (!fs.existsSync(expectedPath)) {
    return `${label}: committed output is missing (${path.relative(root, expectedPath)})`;
  }
  if (!fs.existsSync(generatedPath)) {
    return `${label}: regenerated output is missing (${generatedPath})`;
  }

  const result = spawnSync("diff", ["-u", expectedPath, generatedPath], {
    encoding: "utf8",
  });
  if (result.status === 0) return null;

  const diff = (result.stdout || result.stderr || "").trim();
  return `${label} drifted:\n${diff}`;
}

function profitTypeFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter(
      (name) =>
        name.startsWith("jobProfit") ||
        name.startsWith("getJobProfit") ||
        name.startsWith("getJobsProfitSummary"),
    )
    .sort();
}

function compareDirectory(expectedDirectory, generatedDirectory, label) {
  const expectedFiles = profitTypeFiles(expectedDirectory);
  const generatedFiles = profitTypeFiles(generatedDirectory);
  const names = [...new Set([...expectedFiles, ...generatedFiles])].sort();
  const errors = [];

  for (const name of names) {
    const error = compareFile(
      path.join(expectedDirectory, name),
      path.join(generatedDirectory, name),
      `${label} (${name})`,
    );
    if (error) errors.push(error);
  }

  return errors;
}

function compareGeneratedOutputs(temporaryRoot) {
  const errors = [];
  for (const comparison of generatedComparisons) {
    if (comparison.directory) {
      errors.push(
        ...compareDirectory(
          comparison.expected,
          comparison.generated(temporaryRoot),
          comparison.label,
        ),
      );
      continue;
    }

    const error = compareFile(
      comparison.expected,
      comparison.generated(temporaryRoot),
      comparison.label,
    );
    if (error) errors.push(error);
  }
  return errors;
}

function verifyServerResponseContract() {
  const zodBuild = spawnSync(
    "pnpm",
    ["exec", "tsc", "-b", "lib/api-zod"],
    { cwd: root, encoding: "utf8" },
  );
  if (zodBuild.status !== 0) {
    return [
      "Generated Zod package typecheck failed:",
      zodBuild.stdout,
      zodBuild.stderr,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const serverTypecheck = spawnSync(
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "typecheck"],
    { cwd: root, encoding: "utf8" },
  );
  if (serverTypecheck.status !== 0) {
    return [
      "API server typecheck failed while validating buildJobProfitResponse:",
      serverTypecheck.stdout,
      serverTypecheck.stderr,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

function main() {
  if (!fs.existsSync(openapiPath)) {
    throw new Error(`OpenAPI spec is missing: ${openapiPath}`);
  }

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "buildpro-job-profit-contract-"),
  );
  let configDirectory;
  try {
    const temporaryConfig = writeTemporaryConfig(temporaryRoot);
    configDirectory = temporaryConfig.configDirectory;
    runCodegen(temporaryConfig.configPath);

    const errors = compareGeneratedOutputs(temporaryRoot);
    const serverError = verifyServerResponseContract();
    if (serverError) errors.push(serverError);

    if (errors.length) {
      console.error(
        [
          "Job-profit API contract check failed.",
          "Regenerated outputs were kept in a temporary directory only; no repository or production data was changed.",
          ...errors.map((error) => `\n${error}`),
        ].join("\n"),
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      "Job-profit API contract check passed: OpenAPI codegen matches generated profit outputs and buildJobProfitResponse typechecks.",
    );
  } finally {
    if (configDirectory) {
      fs.rmSync(configDirectory, { recursive: true, force: true });
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(
    `Job-profit API contract check could not complete: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
}