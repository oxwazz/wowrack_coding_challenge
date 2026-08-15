import type { Kysely } from "kysely";
import type { JobStepDefinition } from "../../types.js";
import type { Database } from "../types.js";

const withPublicIpId = "deploy-vm-with-public-ip";
const withoutPublicIpId = "deploy-vm-without-public-ip";

const baseSteps: JobStepDefinition[] = [
  { id: "vpc", handler: "create_vpc", dependsOn: [] },
  { id: "subnet", handler: "create_subnet", dependsOn: ["vpc"] },
  { id: "acl-list", handler: "create_acl_list", dependsOn: ["vpc"] },
  { id: "acl-rule", handler: "create_acl_rule", dependsOn: ["acl-list"] },
  { id: "attach-acl", handler: "attach_acl_list", dependsOn: ["subnet", "acl-rule"] },
  { id: "vm", handler: "deploy_vm", dependsOn: ["attach-acl"] },
];

const publicIpSteps: JobStepDefinition[] = [
  { id: "public-ip", handler: "list_public_ip", dependsOn: ["vm"] },
  { id: "static-nat", handler: "enable_static_nat", dependsOn: ["vm", "public-ip"] },
];

export async function up(db: Kysely<Database>): Promise<void> {
  const timestamp = new Date().toISOString();
  await db.insertInto("jobs").values([
    {
      id: withPublicIpId,
      name: "Deploy VM dengan Public IP",
      definition: JSON.stringify({ steps: [...baseSteps, ...publicIpSteps] }),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: withoutPublicIpId,
      name: "Deploy VM tanpa Public IP",
      definition: JSON.stringify({ steps: baseSteps }),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]).onConflict((conflict) => conflict.column("id").doNothing()).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom("jobs")
    .where("id", "in", [withPublicIpId, withoutPublicIpId])
    .execute();
}
