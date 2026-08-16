import type { Kysely } from "kysely";
import type { Database } from "../types.js";

const definitionIds = [
  "deploy-vpc-with-acl-rules",
  "deploy-vm-with-missing-subnet",
] as const;

/** Adds one valid and one intentionally invalid definition for DAG validation. */
export async function up(db: Kysely<Database>): Promise<void> {
  const timestamp = new Date().toISOString();
  await db.insertInto("jobs").values([
    {
      id: definitionIds[0],
      name: "Deploy VPC dengan ACL rules",
      definition: JSON.stringify(["vpc", "acl-list", "acl-rule"]),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: definitionIds[1],
      name: "Deploy VM tanpa dependency subnet",
      definition: JSON.stringify(["vpc", "acl-list", "vm"]),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]).onConflict((conflict) => conflict.column("id").doNothing()).execute();
}

/** Removes only the definition-check examples added by this migration. */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom("jobs").where("id", "in", [...definitionIds]).execute();
}
