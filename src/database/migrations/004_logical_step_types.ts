import type { Kysely } from "kysely";
import type { JobDefinition } from "../../types.js";
import type { Database } from "../types.js";

const logicalTypeByLegacyType: Readonly<Record<string, string>> = {
  create_vpc: "vpc",
  create_subnet: "subnet",
  create_acl_list: "acl-list",
  create_acl_rule: "acl-rule",
  attach_acl_list: "attach-acl",
  deploy_vm: "vm",
  list_public_ip: "public-ip",
  enable_static_nat: "static-nat",
};

const legacyTypeByLogicalType = Object.fromEntries(
  Object.entries(logicalTypeByLegacyType).map(([legacyType, logicalType]) => [
    logicalType,
    legacyType,
  ]),
);

/** Moves deployment snapshots from implementation names to stable logical step types. */
export async function up(db: Kysely<Database>): Promise<void> {
  await updateDeploymentSnapshots(db, logicalTypeByLegacyType);
}

/** Restores the handler-style type names used before the combined step registry. */
export async function down(db: Kysely<Database>): Promise<void> {
  await updateDeploymentSnapshots(db, legacyTypeByLogicalType);
}

async function updateDeploymentSnapshots(
  db: Kysely<Database>,
  typeMapping: Readonly<Record<string, string>>,
): Promise<void> {
  const rows = await db.selectFrom("jobRuns")
    .select(["id", "jobsSnapshot"])
    .where("jobDefinitionId", "is not", null)
    .execute();
  for (const row of rows) {
    const snapshot = row.jobsSnapshot.map((job): JobDefinition => ({
      ...job,
      type: typeMapping[job.type] ?? job.type,
    }));
    await db.updateTable("jobRuns")
      .set({ jobsSnapshot: JSON.stringify(snapshot) })
      .where("id", "=", row.id)
      .execute();
  }
}
