import Sqlite from "better-sqlite3";
import {
  CamelCasePlugin,
  Kysely,
  ParseJSONResultsPlugin,
  SqliteDialect,
} from "kysely";
import type { Database } from "./types.js";

export function createDatabase(filename: string): Kysely<Database> {
  const sqlite = new Sqlite(filename);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") sqlite.pragma("journal_mode = WAL");

  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
    plugins: [
      new CamelCasePlugin({ maintainNestedObjectKeys: true }),
      new ParseJSONResultsPlugin(),
    ],
  });
}
