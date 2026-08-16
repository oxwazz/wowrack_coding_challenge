import type { Kysely } from "kysely";
import type { Database } from "../types.js";

interface LegacyDefinition {
  steps: Array<{ id: string }>;
}

// Historical migration data is kept local so future registry refactors cannot change rollback.
const legacySteps: Readonly<Record<string, {
  id: string;
  handler: string;
  dependsOn: readonly string[];
}>> = {
  vpc: { id: "vpc", handler: "create_vpc", dependsOn: [] },
  subnet: { id: "subnet", handler: "create_subnet", dependsOn: ["vpc"] },
  "acl-list": { id: "acl-list", handler: "create_acl_list", dependsOn: ["vpc"] },
  "acl-rule": {
    id: "acl-rule", handler: "create_acl_rule", dependsOn: ["acl-list"],
  },
  "attach-acl": {
    id: "attach-acl", handler: "attach_acl_list", dependsOn: ["subnet", "acl-list"],
  },
  vm: { id: "vm", handler: "deploy_vm", dependsOn: ["subnet"] },
  "public-ip": { id: "public-ip", handler: "list_public_ip", dependsOn: [] },
  "static-nat": {
    id: "static-nat", handler: "enable_static_nat", dependsOn: ["vm", "public-ip"],
  },
};

function isStepIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLegacyDefinition(value: unknown): value is LegacyDefinition {
  if (value === null || typeof value !== "object" || !("steps" in value)) return false;
  const steps = value.steps;
  return Array.isArray(steps) && steps.every((step) => (
    step !== null && typeof step === "object" && "id" in step && typeof step.id === "string"
  ));
}

/** Converts legacy embedded DAG definitions into arrays of deployment step IDs. */
export async function up(db: Kysely<Database>): Promise<void> {
  const rows = await db.selectFrom("jobs").select(["id", "definition"]).execute();
  for (const row of rows) {
    const definition: unknown = row.definition;
    if (isStepIdArray(definition)) continue;
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
    if (!isStepIdArray(definition)) continue;
    const steps = definition.map((stepId) => {
      const step = legacySteps[stepId];
      if (step === undefined) {
        throw new Error(`Unknown legacy deployment step ID: ${stepId}`);
      }
      return step;
    });
    await db.updateTable("jobs")
      .set({ definition: JSON.stringify({ steps }) })
      .where("id", "=", row.id)
      .execute();
  }
}
