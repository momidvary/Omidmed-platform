#!/usr/bin/env node

// Builds database/supabase-sql-editor/02_all_migrations.sql: every numbered
// migration in order, wrapped with the same public.schema_migrations ledger
// rows that migrate.mjs writes. It exists for projects set up from the
// Supabase SQL Editor (no psql available). After running it, later upgrades
// go through `node database/scripts/migrate.mjs` as usual — the checksums
// match, so the runner sees every version as applied.
//
//   node database/scripts/build-sql-editor-bundle.mjs          # (re)write
//   node database/scripts/build-sql-editor-bundle.mjs --check  # CI: fail if stale

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const migrationsDirectory = join(repositoryRoot, "database", "migrations");
const outputPath = join(
  repositoryRoot,
  "database",
  "supabase-sql-editor",
  "02_all_migrations.sql"
);
const checkOnly = process.argv.includes("--check");

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const migrations = readdirSync(migrationsDirectory)
  .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
  .sort((left, right) => left.localeCompare(right))
  .map((filename) => {
    // Same canonicalisation as migrate.mjs so ledger checksums match.
    const source = readFileSync(join(migrationsDirectory, filename), "utf8").replace(
      /\r\n?/g,
      "\n"
    );
    return {
      version: filename.slice(0, 3),
      filename,
      source,
      checksum: createHash("sha256").update(source).digest("hex"),
    };
  });

const parts = [];
parts.push(`-- GENERATED FILE — do not edit. Rebuild with:
--   node database/scripts/build-sql-editor-bundle.mjs
--
-- PhysioAI: all migrations (${migrations[0].version}–${migrations.at(-1).version}) for the Supabase SQL Editor.
-- Run on a project whose public schema is EMPTY (fresh project, or after
-- 01_reset_app_schema.sql). Paste the whole file and press Run once.

do $preflight$
begin
  if to_regclass('public.schema_migrations') is not null then
    raise exception using
      errcode = '55000',
      message = 'Migrations were already applied (schema_migrations exists). Upgrade with node database/scripts/migrate.mjs instead.';
  end if;
  if to_regclass('public.profiles') is not null
     or to_regclass('public.clinics') is not null
     or to_regclass('public.patients') is not null
     or to_regclass('public.care_episodes') is not null then
    raise exception using
      errcode = '55000',
      message = 'The public schema already has app tables. Run 01_reset_app_schema.sql first (only if it holds no real data).';
  end if;
end
$preflight$;

create table public.schema_migrations (
  version text primary key check (version ~ '^[0-9]{3}$'),
  filename text not null unique,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('applying', 'applied')),
  started_at timestamptz not null default clock_timestamp(),
  applied_at timestamptz
);
revoke all on table public.schema_migrations from public, anon, authenticated, service_role;
`);

for (const migration of migrations) {
  parts.push(`
-- ════════════════════════════════════════════════════════════════
-- ${migration.filename}
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values (${sqlLiteral(migration.version)}, ${sqlLiteral(migration.filename)}, ${sqlLiteral(migration.checksum)}, 'applying');

${migration.source.trimEnd()}

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = ${sqlLiteral(migration.version)} and status = 'applying';
`);
}

parts.push(`
select count(*) || ' migrations applied' as result
from public.schema_migrations where status = 'applied';
`);

const bundle = parts.join("");

if (checkOnly) {
  if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== bundle) {
    console.error(
      "database/supabase-sql-editor/02_all_migrations.sql is stale. Run: node database/scripts/build-sql-editor-bundle.mjs"
    );
    process.exit(1);
  }
  console.log("SQL Editor bundle is up to date.");
} else {
  writeFileSync(outputPath, bundle);
  console.log(`Wrote ${outputPath} (${migrations.length} migrations).`);
}
