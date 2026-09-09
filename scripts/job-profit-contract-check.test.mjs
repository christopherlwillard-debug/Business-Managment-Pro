import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkerPath = path.join(root, "scripts", "job-profit-contract-check.mjs");
const trackedGeneratedOutput = path.join(
  root,
  "lib",
  "api-client-react",
  "src",
  "generated",
  "api.schemas.ts",
);

test("rejects a changed splitPool type in generated profit output", () => {
  const before = readFileSync(trackedGeneratedOutput, "utf8");
  const result = spawnSync(
    process.execPath,
    [checkerPath, "--test-mutate-split-pool"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  const after = readFileSync(trackedGeneratedOutput, "utf8");
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

  assert.notEqual(result.status, 0, output);
  assert.equal(after, before, "the checker must not modify tracked generated output");
  assert.match(output, /React client profit schemas/);
  assert.match(output, /splitPool/);
  assert.match(output, /-  splitPool: number;/);
  assert.match(output, /\+  splitPool: string;/);
  assert.match(output, /no repository or production data was changed/);
});