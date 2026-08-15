import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import type { Database } from "./types.js";

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
