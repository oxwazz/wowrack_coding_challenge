import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import type { Database } from "./types.js";

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

async function assertSuccess(
  operation: ReturnType<Migrator["migrateToLatest"]>,
): Promise<void> {
  const { error } = await operation;
  if (error !== undefined) throw error;
}

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  await assertSuccess(migrator(db).migrateToLatest());
}

export async function rollbackLastMigration(db: Kysely<Database>): Promise<void> {
  await assertSuccess(migrator(db).migrateDown());
}
