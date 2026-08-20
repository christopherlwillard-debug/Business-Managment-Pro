#!/usr/bin/env node
/**
 * Schema/API contract inventory.
 *
 * This is intentionally dependency-free so it can run before the application
 * is built. It documents the current boundary between the canonical ledger
 * and historical migration/startup code, and makes route/spec drift visible.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const canonicalDir = path.join(root, "lib/db/migrations");
const legacyMigrationDirs = [
  "lib/db/src/migrations",
  "artifacts/api-server/src/migrations",
];
const startupFiles = [
  "artifacts/api-server/src/index.ts",
  "scripts/post-merge.sh",
];
const routeIndex = path.join(root, "artifacts/api-server/src/routes/index.ts");
const routesDir = path.join(root, "artifacts/api-server/src/routes");
const openapiPath = path.join(root, "lib/api-spec/openapi.yaml");
const clientDir = path.join(root, "lib/api-client-react/src/generated");
const outputPath = path.join(root, "docs/schema-api-contract-inventory.md");

const read = (file) => fs.readFileSync(file, "utf8");
const files = (dir) =>
  fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile());
const migrationId = (name) => {
  const match = name.match(/^(\d+)[_-]/);
  return match ? Number(match[1]) : null;
};
const normalizePath = (value) =>
  value
    .replace(/\$\{[^}]+\}/g, "{param}")
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";

function migrationSummary(dir) {
  const names = files(path.join(root, dir)).sort();
  const numbered = names.map((name) => ({ name, id: migrationId(name) })).filter((x) => x.id !== null);
  const ids = numbered.map((x) => x.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return { names, numbered, duplicates };
}

function routeMounts() {
  const source = read(routeIndex);
  return [...source.matchAll(/router\.use\((?:"([^"]+)",\s*)?([A-Za-z][A-Za-z0-9]*)\);/g)]
    .map((match) => ({ prefix: match[1] ?? "", router: match[2] }));
}

function routeOperations() {
  const mounts = routeMounts();
  const imports = Object.fromEntries(
    [...read(routeIndex).matchAll(/import\s+(\w+Router)\s+from\s+"\.\/([^"]+)";/g)]
      .map((match) => [match[1], match[2].replace(/\.js$/, "")]),
  );
  const operations = [];
  for (const mount of mounts) {
    const file = imports[mount.router];
    if (!file) continue;
    const routeFile = path.join(routesDir, `${file}.ts`);
    if (!fs.existsSync(routeFile)) continue;
    const source = read(routeFile);
    for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      operations.push({
        method: match[1].toUpperCase(),
        path: normalizePath(`/api${mount.prefix}${match[2]}`),
        source: `artifacts/api-server/src/routes/${file}.ts`,
      });
    }
  }
  return operations.sort((a, b) => `${a.path}${a.method}`.localeCompare(`${b.path}${b.method}`));
}

function openapiPaths() {
  return read(openapiPath)
    .split("\n")
    .map((line) => line.match(/^  (\/[^:#]+):\s*$/)?.[1])
    .filter(Boolean)
    .map((entry) => normalizePath(`/api${entry}`));
}

function frontendCallers() {
  const roots = [path.join(root, "artifacts/contractor-app/src"), path.join(root, "lib/api-client-react/src")];
  const matches = new Set();
  function visit(dir) {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      if (stat.isDirectory()) visit(file);
      else if (/\.(ts|tsx)$/.test(name)) {
        for (const match of read(file).matchAll(/["'`]((?:\/api|https?:\/\/[^"'`]+\/api)[^"'`]*)["'`]/g)) {
          matches.add(normalizePath(match[1].replace(/\?.*$/, "")));
        }
      }
    }
  }
  roots.filter(fs.existsSync).forEach(visit);
  return [...matches].sort();
}

function markdownTable(rows, columns) {
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  return [header, divider, ...rows.map((row) => `| ${columns.map((column) => row[column] ?? "").join(" | ")} |`)].join("\n");
}

function buildInventory() {
  const canonical = migrationSummary("lib/db/migrations");
  const legacy = legacyMigrationDirs.map((dir) => ({ dir, ...migrationSummary(dir) }));
  const startup = startupFiles.map((file) => {
    const source = read(path.join(root, file));
    return {
      file,
      ddlStatements: (source.match(/\b(CREATE TABLE|ALTER TABLE|CREATE INDEX|DROP TABLE|DROP COLUMN)\b/gi) ?? []).length,
      dataStatements: (source.match(/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/gi) ?? []).length,
    };
  });
  const routes = routeOperations();
  const spec = openapiPaths();
  const specSet = new Set(spec);
  const missingFromSpec = [...new Set(routes.map((route) => route.path))].filter((route) => !specSet.has(route));
  const callers = frontendCallers();

  return { canonical, legacy, startup, routes, spec, missingFromSpec, callers };
}

function render(data) {
  const canonicalIds = data.canonical.numbered.map((item) => String(item.id).padStart(4, "0"));
  const routeRows = data.routes.map((route) => ({
    method: route.method,
    path: route.path,
    source: route.source,
    contract: data.spec.includes(route.path) ? "OpenAPI" : "Not in OpenAPI",
  }));
  return `# Schema and API contract inventory

Generated by \`node scripts/schema-contract-inventory.mjs\`. Do not edit this file by hand.

Generated: ${new Date().toISOString().slice(0, 10)}

## Authority

- **Schema shape:** \`lib/db/src/schema/index.ts\` and its imported Drizzle schema modules.
- **Migration ledger:** \`lib/db/migrations/\`, the only numbered migration directory for new changes.
- **Execution:** reviewed SQL from \`lib/db/migrations/\` is applied through the documented release process; \`drizzle-kit push\` is development-only schema synchronization and is not a production migration ledger.
- **Historical only:** \`lib/db/src/migrations/\` and \`artifacts/api-server/src/migrations/\` are retained for provenance and reconciliation. Do not add migrations there.
- **API contract:** \`lib/api-spec/openapi.yaml\`, with generated clients regenerated by \`pnpm --filter @workspace/api-spec run codegen\`.
- **Runtime route source:** \`artifacts/api-server/src/routes/index.ts\` plus the mounted route modules and the public/webhook mounts in \`artifacts/api-server/src/app.ts\`.

## Migration ledger

Canonical files: ${data.canonical.names.length}; numbered IDs: ${canonicalIds.length}; duplicate canonical IDs: ${data.canonical.duplicates.length ? data.canonical.duplicates.join(", ") : "none"}.

${markdownTable(
  [
    { tree: "lib/db/migrations", role: "Canonical post-baseline ledger", files: data.canonical.names.length, duplicates: data.canonical.duplicates.join(", ") || "none" },
    ...data.legacy.map((item) => ({
      tree: item.dir,
      role: "Historical / reconciliation only",
      files: item.names.length,
      duplicates: item.duplicates.join(", ") || "none",
    })),
  ],
  ["tree", "role", "files", "duplicates"],
)}

New schema changes must be reviewed against the Drizzle schema, added once to the canonical ledger, and verified in development before release. Legacy files must not be renumbered or copied into the canonical ledger without a reconciliation note and data check.

## Startup DDL and data changes

The following code still performs database changes outside the migration ledger. These are an explicit reconciliation queue; they are not silently treated as migrations.

${markdownTable(data.startup, ["file", "ddlStatements", "dataStatements"])}

'artifacts/api-server/src/index.ts' startup routines are expected to become read/seed/recompute operations only. Any remaining 'CREATE', 'ALTER', or one-time backfill must first be represented by a reviewed canonical migration, verified against production schema/data, and then removed from startup. 'scripts/post-merge.sh' must only orchestrate approved migrations and non-destructive setup; it must not be the source of schema truth.

## API contract inventory

- Mounted route operations discovered: ${data.routes.length}
- OpenAPI path entries: ${data.spec.length}
- Distinct route paths absent from OpenAPI: ${data.missingFromSpec.length}
- Generated client files: ${files(clientDir).filter((name) => /\.(ts|tsx)$/.test(name)).length}
- Frontend API path callers discovered: ${data.callers.length}

${data.missingFromSpec.length ? `Routes absent from OpenAPI (first ${Math.min(data.missingFromSpec.length, 80)}):\n\n${data.missingFromSpec.slice(0, 80).map((route) => `- \`${route}\``).join("\n")}\n` : "All discovered mounted route paths have an OpenAPI path entry.\n"}

The inventory intentionally reports gaps rather than pretending the generated client covers every route. A route is complete only when its request/response contract is in OpenAPI, generated output is regenerated, and frontend callers use that contract (or the route is explicitly marked server-only/public).

## Mounted route operations

${markdownTable(routeRows, ["method", "path", "source", "contract"])}

## Frontend callers

${data.callers.map((caller) => `- \`${caller}\``).join("\n") || "_No direct path callers discovered._"}
`;
}

const data = buildInventory();
const inventory = render(data);
const check = process.argv.includes("--check");

if (check) {
  const errors = [];
  if (data.canonical.duplicates.length) {
    errors.push(`duplicate canonical migration IDs: ${data.canonical.duplicates.join(", ")}`);
  }
  if (!fs.existsSync(openapiPath)) errors.push(`missing OpenAPI spec: ${openapiPath}`);
  if (!fs.existsSync(clientDir)) errors.push(`missing generated client directory: ${clientDir}`);
  if (errors.length) {
    console.error(`Schema/API contract check failed:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`Schema/API contract check passed: ${data.canonical.names.length} canonical migrations, ${data.routes.length} route operations, ${data.spec.length} OpenAPI paths.`);
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, inventory);
  console.log(`Wrote ${path.relative(root, outputPath)}`);
}