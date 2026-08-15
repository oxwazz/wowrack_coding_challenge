import type { Kysely } from "kysely";
import { buildApiJobGraph } from "../../core/api-job-graph.js";
import type { Database } from "../types.js";

interface LegacyDefinition {
  steps: Array<{ id: string }>;
}

function isApiIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLegacyDefinition(value: unknown): value is LegacyDefinition {
  if (value === null || typeof value !== "object" || !("steps" in value)) return false;
  const steps = value.steps;
  return Array.isArray(steps) && steps.every((step) => (
    step !== null && typeof step === "object" && "id" in step && typeof step.id === "string"
  ));
}

/** Converts legacy embedded DAG definitions into arrays of API IDs. */
export async function up(db: Kysely<Database>): Promise<void> {
  const rows = await db.selectFrom("jobs").select(["id", "definition"]).execute();
  for (const row of rows) {
    const definition: unknown = row.definition;
    if (isApiIdArray(definition)) continue;
    if (!isLegacyDefinition(definition)) {
      throw new Error(`Invalid legacy job definition: ${row.id}`);
    }
    await db.updateTable("jobs")
      .set({ definition: JSON.stringify(definition.steps.map((step) => step.id)) })
      .where("id", "=", row.id)
      .execute();
  }
}

/** Restores the legacy embedded DAG shape when this migration is rolled back. */
export async function down(db: Kysely<Database>): Promise<void> {
  const rows = await db.selectFrom("jobs").select(["id", "definition"]).execute();
  for (const row of rows) {
    const definition: unknown = row.definition;
    if (!isApiIdArray(definition)) continue;
    await db.updateTable("jobs")
      .set({ definition: JSON.stringify({ steps: buildApiJobGraph(definition) }) })
      .where("id", "=", row.id)
      .execute();
  }
}
