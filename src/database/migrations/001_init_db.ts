import type { Kysely } from "kysely";
import type { Database } from "../types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable("jobs").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("definition", "text", (column) => column.notNull())
    .addColumn("createdAt", "text", (column) => column.notNull())
    .addColumn("updatedAt", "text", (column) => column.notNull())
    .execute();

  await db.schema.createTable("jobRuns").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("jobDefinitionId", "text", (column) => column.references("jobs.id"))
    .addColumn("jobsSnapshot", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("createdAt", "text", (column) => column.notNull())
    .execute();

  await db.schema.createTable("jobRunLogs").ifNotExists()
    .addColumn("id", "integer", (column) => column.primaryKey().autoIncrement())
    .addColumn("jobRunId", "text", (column) =>
      column.notNull().references("jobRuns.id").onDelete("cascade"))
    .addColumn("jobId", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("attempt", "integer", (column) => column.notNull())
    .addColumn("result", "text")
    .addColumn("error", "text")
    .addColumn("createdAt", "text", (column) => column.notNull())
    .execute();

  await db.schema.createIndex("job_run_logs_lookup_idx").ifNotExists()
    .on("jobRunLogs").columns(["jobRunId", "jobId", "id"]).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("jobRunLogs").ifExists().execute();
  await db.schema.dropTable("jobRuns").ifExists().execute();
  await db.schema.dropTable("jobs").ifExists().execute();
}
