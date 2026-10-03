#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const migrationsDirectory = join(repositoryRoot, "database", "migrations");
const args = new Set(process.argv.slice(2));
const allowBaseline = args.has("--allow-baseline");
const showStatus = args.has("--status");
const allowedArgs = new Set(["--allow-baseline", "--status", "--help"]);

if (args.has("--help")) {
  process.stdout.write(`PhysioAI tracked migration runner

Usage:
  node database/scripts/migrate.mjs --allow-baseline  # empty database only
  node database/scripts/migrate.mjs                   # tracked upgrades
  node database/scripts/migrate.mjs --status          # read-only ledger

Connection: set DATABASE_URL, or standard PGHOST/PGPORT/PGUSER/PGPASSWORD/
PGDATABASE variables. The runner requires the PostgreSQL psql client.
`);
  process.exit(0);
}

for (const argument of args) {
  if (!allowedArgs.has(argument)) {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

const migrationFiles = readdirSync(migrationsDirectory)
  .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
  .sort((left, right) => left.localeCompare(right));

if (migrationFiles.length === 0) {
  throw new Error("No numbered migrations were found.");
}

const migrations = migrationFiles.map((filename) => {
  const version = filename.slice(0, 3);
  const source = readFileSync(join(migrationsDirectory, filename), "utf8");
  // Git may materialize text as CRLF on Windows and LF in Linux CI. Hash the
  // canonical SQL content so one migration keeps the same ledger checksum
  // across developer machines and deployment runners.
  const canonicalSource = source.replace(/\r\n?/g, "\n");
  return {
    version,
    filename,
    source,
    checksum: createHash("sha256").update(canonicalSource).digest("hex"),
  };
});

if (new Set(migrations.map((migration) => migration.version)).size !== migrations.length) {
  throw new Error("Migration versions must be unique.");
}

const psqlBinary = process.env.PSQL_BIN || "psql";
let prefixArgs = [];
if (process.env.PHYSIOAI_PSQL_PREFIX_ARGS) {
  const parsed = JSON.parse(process.env.PHYSIOAI_PSQL_PREFIX_ARGS);
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("PHYSIOAI_PSQL_PREFIX_ARGS must be a JSON string array.");
  }
  prefixArgs = parsed;
}

const childEnvironment = { ...process.env };
if (process.env.DATABASE_URL && !process.env.PGDATABASE) {
  childEnvironment.PGDATABASE = process.env.DATABASE_URL;
}
delete childEnvironment.DATABASE_URL;

function runPsql(input, extraArgs = []) {
  const result = spawnSync(
    psqlBinary,
    [...prefixArgs, "-X", "-v", "ON_ERROR_STOP=1", ...extraArgs],
    {
      cwd: repositoryRoot,
      env: childEnvironment,
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024,
    }
  );
  if (result.error) throw result.error;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`psql exited with status ${result.status}`);
  }
}

if (showStatus) {
  runPsql(
    `select version, filename, checksum, status, started_at, applied_at
     from public.schema_migrations order by version;\n`
  );
  process.exit(0);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const knownVersions = migrations.map((migration) => sqlLiteral(migration.version)).join(", ");
const plan = [];
plan.push("\\set ON_ERROR_STOP on");
plan.push("select pg_advisory_lock(hashtextextended('physioai:migrations', 0));");
plan.push(`do $preflight$
begin
  if to_regclass('public.schema_migrations') is null then
    if not ${allowBaseline ? "true" : "false"} then
      raise exception using
        errcode = '55000',
        message = 'No migration ledger exists. Use --allow-baseline only for a verified empty database.';
    end if;
    if to_regclass('public.profiles') is not null
       or to_regclass('public.clinics') is not null
       or to_regclass('public.patients') is not null
       or to_regclass('public.care_episodes') is not null then
      raise exception using
        errcode = '55000',
        message = 'Refusing destructive baseline on a database that already contains core tables.';
    end if;
  elsif not exists (select 1 from public.schema_migrations)
        and (
          to_regclass('public.profiles') is not null
          or to_regclass('public.clinics') is not null
          or to_regclass('public.patients') is not null
          or to_regclass('public.care_episodes') is not null
        ) then
    raise exception using
      errcode = '55000',
      message = 'An empty ledger cannot adopt an existing schema automatically.';
  end if;
end
$preflight$;`);
plan.push(`create table if not exists public.schema_migrations (
  version text primary key check (version ~ '^[0-9]{3}$'),
  filename text not null unique,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('applying', 'applied')),
  started_at timestamptz not null default clock_timestamp(),
  applied_at timestamptz
);`);
plan.push("revoke all on table public.schema_migrations from public, anon, authenticated, service_role;");
plan.push(`do $ledger$
begin
  if exists (
    select 1 from public.schema_migrations
    where version not in (${knownVersions})
  ) then
    raise exception using
      errcode = '55000',
      message = 'Migration ledger contains a version that is absent from this checkout.';
  end if;
  if exists (select 1 from public.schema_migrations where status = 'applying') then
    raise exception using
      errcode = '55000',
      message = 'A migration is marked applying. Inspect the database before retrying.';
  end if;
end
$ledger$;`);

for (const migration of migrations) {
  const variable = `migration_${migration.version}_applied`;
  plan.push(`do $checksum_${migration.version}$
declare
  v_checksum text;
  v_filename text;
begin
  select checksum, filename into v_checksum, v_filename
  from public.schema_migrations where version = ${sqlLiteral(migration.version)};
  if found and (
    v_checksum <> ${sqlLiteral(migration.checksum)}
    or v_filename <> ${sqlLiteral(migration.filename)}
  ) then
    raise exception using
      errcode = '55000',
      message = 'Applied migration ${migration.version} does not match this checkout.';
  end if;
end
$checksum_${migration.version}$;`);
  plan.push(`select exists (
  select 1 from public.schema_migrations
  where version = ${sqlLiteral(migration.version)} and status = 'applied'
) as ${variable} \\gset`);
  plan.push(`\\if :${variable}`);
  plan.push(`\\echo 'SKIP ${migration.filename}'`);
  plan.push("\\else");
  plan.push(`\\echo 'APPLY ${migration.filename}'`);
  plan.push(`insert into public.schema_migrations (
  version, filename, checksum, status
) values (
  ${sqlLiteral(migration.version)},
  ${sqlLiteral(migration.filename)},
  ${sqlLiteral(migration.checksum)},
  'applying'
);`);
  plan.push(migration.source);
  plan.push(`update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = ${sqlLiteral(migration.version)} and status = 'applying';`);
  plan.push("\\endif");
}

plan.push("select pg_advisory_unlock(hashtextextended('physioai:migrations', 0));");
runPsql(`${plan.join("\n")}\n`);
