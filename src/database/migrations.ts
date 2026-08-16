import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql, type Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import type { Database } from "./types.js";

const squashedMigrationNames = [
  "003_api_id_definitions",
  "004_logical_step_types",
] as const;

/** Creates the Kysely migrator that loads migrations from the local migrations directory. */
function migrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
    }),
  });
}

/** Awaits a migration operation and rethrows any migration error. */
async function assertSuccess(
  operation: ReturnType<Migrator["migrateToLatest"]>,
): Promise<void> {
  const { error } = await operation;
  if (error !== undefined) throw error;
}

/** Removes completed pre-squash migration records after verifying the full pair exists. */
async function normalizeSquashedMigrationHistory(db: Kysely<Database>): Promise<void> {
  const migrationTable = await sql<{ name: string }>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'kysely_migration'
  `.execute(db);
  if (migrationTable.rows.length === 0) return;

  const history = await sql<{ name: string }>`
    SELECT name FROM kysely_migration
    WHERE name IN ('003_api_id_definitions', '004_logical_step_types')
    ORDER BY name
  `.execute(db);
  if (history.rows.length === 0) return;
  if (
    history.rows.length !== squashedMigrationNames.length
    || history.rows.some(({ name }, index) => name !== squashedMigrationNames[index])
  ) {
    throw new Error("Cannot normalize partially applied squashed migrations");
  }
  await sql`
    DELETE FROM kysely_migration
    WHERE name IN ('003_api_id_definitions', '004_logical_step_types')
  `.execute(db);
}

/**
 * Applies every pending database migration in filename order.
 *
 * @param db - Open orchestrator database connection.
 * @throws The original migration error when any migration fails.
 *
 * @example
 * ```ts
 * const db = createDatabase("deployments.sqlite");
 * await migrateToLatest(db);
 * ```
 */
export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  await normalizeSquashedMigrationHistory(db);
  await assertSuccess(migrator(db).migrateToLatest());
}

/**
 * Rolls back the most recently applied database migration.
 *
 * @param db - Open orchestrator database connection.
 * @throws The original migration error when rollback fails.
 *
 * @example
 * ```ts
 * await rollbackLastMigration(db);
 * ```
 */
export async function rollbackLastMigration(db: Kysely<Database>): Promise<void> {
  await assertSuccess(migrator(db).migrateDown());
}
