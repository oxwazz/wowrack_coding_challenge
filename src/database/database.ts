import Sqlite from "better-sqlite3";
import {
  CamelCasePlugin,
  Kysely,
  ParseJSONResultsPlugin,
  SqliteDialect,
} from "kysely";
import type { Database } from "./types.js";

/**
 * Creates a Kysely connection configured for the orchestrator's SQLite schema.
 * Foreign keys and a busy timeout are enabled, while file-backed databases also use WAL mode.
 *
 * @param filename - SQLite filename, or `:memory:` for an in-memory database.
 * @returns A typed Kysely connection. The caller is responsible for destroying it.
 *
 * @example
 * ```ts
 * const database = createDatabase(":memory:");
 * await migrateToLatest(database);
 * await database.destroy();
 * ```
 */
export function createDatabase(filename: string): Kysely<Database> {
  const sqlite = new Sqlite(filename);
  // These pragmas protect referential integrity and reduce transient lock failures.
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  // WAL improves concurrent CLI reads while the scheduler is writing progress logs.
  if (filename !== ":memory:") sqlite.pragma("journal_mode = WAL");

  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
    plugins: [
      new CamelCasePlugin({ maintainNestedObjectKeys: true }),
      new ParseJSONResultsPlugin(),
    ],
  });
}
