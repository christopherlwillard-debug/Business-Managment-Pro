#!/usr/bin/env node
/**
 * Fails when a Drizzle table is not named in the architecture registry.
 *
 * This is deliberately a small, dependency-free guard. It does not decide
 * ownership; it only makes a newly introduced table trigger architecture
 * review instead of silently becoming an undocumented source of truth.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaDir = path.join(root, "lib/db/src/schema");
const registryPath = path.join(root, ".agents/architecture/SYSTEM_REGISTRY.md");
const registry = fs.readFileSync(registryPath, "utf8");

const tables = new Set();
for (const name of fs.readdirSync(schemaDir)) {
  if (!name.endsWith(".ts") || name === "index.ts") continue;
  const source = fs.readFileSync(path.join(schemaDir, name), "utf8");
  for (const match of source.matchAll(/pgTable\(\s*"([^"]+)"/g)) tables.add(match[1]);
}

const missing = [...tables].filter(table => !registry.includes(`\`${table}\``)).sort();
if (missing.length) {
  console.error("System registry check failed; review and register these tables:");
  for (const table of missing) console.error(`- ${table}`);
  process.exit(1);
}

console.log(`System registry check passed: ${tables.size} schema tables are named in SYSTEM_REGISTRY.md.`);