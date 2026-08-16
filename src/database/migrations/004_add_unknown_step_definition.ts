import type { Kysely } from "kysely";
import type { Database } from "../types.js";

const definitionId = "deploy-vm-with-unknown-steps";

/** Adds an intentionally invalid definition containing unregistered deployment steps. */
export async function up(db: Kysely<Database>): Promise<void> {
  const timestamp = new Date().toISOString();
  await db.insertInto("jobs").values({
    id: definitionId,
    name: "Deploy VM dengan unknown steps",
    definition: JSON.stringify(["vpc-new", "acl-list", "vm-new"]),
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflict((conflict) => conflict.column("id").doNothing()).execute();
}

/** Removes only the unknown-step definition added by this migration. */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom("jobs").where("id", "=", definitionId).execute();
}
