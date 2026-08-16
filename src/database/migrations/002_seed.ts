import type { Kysely } from "kysely";
import type { Database } from "../types.js";

const withPublicIpId = "deploy-vm-with-public-ip";
const withoutPublicIpId = "deploy-vm-without-public-ip";

// The database selects logical steps; dependencies and behavior live in the combined registry.
const baseStepIds = ["vpc", "subnet", "acl-list", "acl-rule", "attach-acl", "vm"];

// Public-IP deployment appends NAT-specific work without duplicating the base DAG.
const publicIpStepIds = ["public-ip", "static-nat"];

/** Seeds the built-in VM deployment job definitions without replacing existing records. */
export async function up(db: Kysely<Database>): Promise<void> {
  const timestamp = new Date().toISOString();
  await db.insertInto("jobs").values([
    {
      id: withPublicIpId,
      name: "Deploy VM dengan Public IP",
      definition: JSON.stringify([...baseStepIds, ...publicIpStepIds]),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: withoutPublicIpId,
      name: "Deploy VM tanpa Public IP",
      definition: JSON.stringify(baseStepIds),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]).onConflict((conflict) => conflict.column("id").doNothing()).execute();
}

/** Removes job definitions that use the built-in VM deployment identifiers. */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom("jobs")
    .where("id", "in", [withPublicIpId, withoutPublicIpId])
    .execute();
}
