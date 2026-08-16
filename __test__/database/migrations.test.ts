import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sql } from "kysely";
import { rollbackLastMigration } from "../../src/database/migrations.js";
import { OrchestratorStore } from "../../src/database/store.js";

test("runs ordered Kysely schema and reference-data migrations", async () => {
  const store = new OrchestratorStore(":memory:");
  try {
    await store.ready;
    const migrations = await sql<{ name: string }>`
      SELECT name FROM kysely_migration ORDER BY name
    `.execute(store.database);
    assert.deepEqual(migrations.rows.map(({ name }) => name), [
      "001_init_db",
      "002_seed",
      "003_add_definition_check_examples",
      "004_add_unknown_step_definition",
    ]);

    const tables = (await store.database.introspection.getTables())
      .map(({ name }) => name).sort();
    for (const table of ["job_run_logs", "job_runs", "jobs"]) {
      assert(tables.includes(table), `missing table ${table}`);
    }
    assert(!tables.includes("deployments"));
    assert(!tables.includes("job_logs"));
    assert(!tables.includes("job_dependencies"));

    const schema = await store.database.introspection.getTables();
    const columns = (table: string) =>
      schema.find(({ name }) => name === table)?.columns.map(({ name }) => name) ?? [];
    assert(!columns("jobs").includes("enabled"));
    assert(!columns("jobs").includes("version"));
    assert(!columns("job_runs").includes("started_at"));
    assert(!columns("job_runs").includes("finished_at"));
    assert(!columns("job_runs").includes("error"));
    assert(!columns("job_runs").includes("job_definition_version"));
    assert(columns("job_run_logs").includes("job_run_id"));
    assert(!columns("job_run_logs").includes("deployment_id"));
    assert(!columns("job_run_logs").includes("message"));
    assert(!columns("job_run_logs").includes("event"));

    assert.deepEqual(
      await store.database.selectFrom("jobs").select(["id", "name"]).orderBy("id").execute(),
      [
        {
          id: "deploy-vm-with-missing-subnet",
          name: "Deploy VM tanpa dependency subnet",
        },
        {
          id: "deploy-vm-with-public-ip",
          name: "Deploy VM dengan Public IP",
        },
        {
          id: "deploy-vm-with-unknown-steps",
          name: "Deploy VM dengan unknown steps",
        },
        {
          id: "deploy-vm-without-public-ip",
          name: "Deploy VM tanpa Public IP",
        },
        {
          id: "deploy-vpc-with-acl-rules",
          name: "Deploy VPC dengan ACL rules",
        },
      ],
    );
    const withPublicIp = await store.getJobDefinition("deploy-vm-with-public-ip");
    const withoutPublicIp = await store.getJobDefinition("deploy-vm-without-public-ip");
    assert.deepEqual(withPublicIp.stepIds, [
      "vpc", "subnet", "acl-list", "acl-rule", "attach-acl", "vm",
      "public-ip", "static-nat",
    ]);
    assert.deepEqual(withoutPublicIp.stepIds, [
      "vpc", "subnet", "acl-list", "acl-rule", "attach-acl", "vm",
    ]);
    assert.deepEqual(
      (await store.getJobDefinition("deploy-vpc-with-acl-rules")).stepIds,
      ["vpc", "acl-list", "acl-rule"],
    );
    assert.deepEqual(
      (await store.getJobDefinition("deploy-vm-with-missing-subnet")).stepIds,
      ["vpc", "acl-list", "vm"],
    );
    assert.deepEqual(
      (await store.getJobDefinition("deploy-vm-with-unknown-steps")).stepIds,
      ["vpc-new", "acl-list", "vm-new"],
    );
    await assert.rejects(() => store.getJobDefinition("deploy-vm"));
  } finally {
    await store.close();
  }
});

test("runs only pending migrations on the next startup", async () => {
  const databasePath = temporaryDatabasePath("migration-once");
  try {
    const first = new OrchestratorStore(databasePath);
    await first.ready;
    const original = await first.getJobDefinition("deploy-vm-without-public-ip");
    await first.database.updateTable("jobs").set({ name: "Database-owned definition" })
      .where("id", "=", "deploy-vm-without-public-ip").execute();
    await first.close();

    const second = new OrchestratorStore(databasePath);
    try {
      await second.ready;
      const persisted = await second.getJobDefinition("deploy-vm-without-public-ip");
      assert.equal(persisted.name, "Database-owned definition");
      assert.equal(persisted.createdAt, original.createdAt);
      const migrations = await sql<{ count: number }>`
        SELECT COUNT(*) AS count FROM kysely_migration
      `.execute(second.database);
      assert.equal(migrations.rows[0]?.count, 4);
    } finally {
      await second.close();
    }
  } finally {
    removeDatabase(databasePath);
  }
});

test("normalizes migration history created before the two-file squash", async () => {
  const databasePath = temporaryDatabasePath("squashed-migrations");
  try {
    const first = new OrchestratorStore(databasePath);
    await first.ready;
    await sql`
      INSERT INTO kysely_migration (name, timestamp) VALUES
        ('003_api_id_definitions', ${new Date().toISOString()}),
        ('004_logical_step_types', ${new Date().toISOString()})
    `.execute(first.database);
    await first.close();

    const second = new OrchestratorStore(databasePath);
    try {
      await second.ready;
      const migrations = await sql<{ name: string }>`
        SELECT name FROM kysely_migration ORDER BY name
      `.execute(second.database);
      assert.deepEqual(migrations.rows.map(({ name }) => name), [
        "001_init_db",
        "002_seed",
        "003_add_definition_check_examples",
        "004_add_unknown_step_definition",
      ]);
      assert.equal(
        (await second.getJobDefinition("deploy-vm-with-public-ip")).stepIds.length,
        8,
      );
    } finally {
      await second.close();
    }
  } finally {
    removeDatabase(databasePath);
  }
});

test("rejects partially applied squashed migration history", async () => {
  const databasePath = temporaryDatabasePath("partial-squashed-migrations");
  try {
    const first = new OrchestratorStore(databasePath);
    await first.ready;
    await sql`
      INSERT INTO kysely_migration (name, timestamp)
      VALUES ('003_api_id_definitions', ${new Date().toISOString()})
    `.execute(first.database);
    await first.close();

    const second = new OrchestratorStore(databasePath);
    try {
      await assert.rejects(
        second.ready,
        /Cannot normalize partially applied squashed migrations/,
      );
    } finally {
      await second.database.destroy();
    }
  } finally {
    removeDatabase(databasePath);
  }
});

test("rolls schema and reference data back one migration at a time", async () => {
  const store = new OrchestratorStore(":memory:");
  try {
    await store.ready;
    const timestamp = new Date().toISOString();
    await store.database.insertInto("jobs").values({
      id: "user-job",
      name: "User job",
      definition: JSON.stringify([]),
      createdAt: timestamp,
      updatedAt: timestamp,
    }).execute();

    await rollbackLastMigration(store.database);
    await assert.rejects(() => store.getJobDefinition("deploy-vm-with-unknown-steps"));
    assert.equal(
      (await store.getJobDefinition("deploy-vpc-with-acl-rules")).name,
      "Deploy VPC dengan ACL rules",
    );
    assert.equal((await store.getJobDefinition("user-job")).name, "User job");

    let migrations = await sql<{ name: string }>`
      SELECT name FROM kysely_migration ORDER BY name
    `.execute(store.database);
    assert.deepEqual(migrations.rows.map(({ name }) => name), [
      "001_init_db", "002_seed", "003_add_definition_check_examples",
    ]);

    await rollbackLastMigration(store.database);
    await assert.rejects(() => store.getJobDefinition("deploy-vpc-with-acl-rules"));
    await assert.rejects(() => store.getJobDefinition("deploy-vm-with-missing-subnet"));
    assert.equal(
      (await store.getJobDefinition("deploy-vm-with-public-ip")).name,
      "Deploy VM dengan Public IP",
    );
    assert.equal((await store.getJobDefinition("user-job")).name, "User job");

    migrations = await sql<{ name: string }>`
      SELECT name FROM kysely_migration ORDER BY name
    `.execute(store.database);
    assert.deepEqual(migrations.rows.map(({ name }) => name), ["001_init_db", "002_seed"]);

    await rollbackLastMigration(store.database);
    await assert.rejects(() => store.getJobDefinition("deploy-vm-with-public-ip"));
    await assert.rejects(() => store.getJobDefinition("deploy-vm-without-public-ip"));
    assert.equal((await store.getJobDefinition("user-job")).name, "User job");

    migrations = await sql<{ name: string }>`
      SELECT name FROM kysely_migration ORDER BY name
    `.execute(store.database);
    assert.deepEqual(migrations.rows.map(({ name }) => name), ["001_init_db"]);

    await rollbackLastMigration(store.database);
    assert.deepEqual(await store.database.introspection.getTables(), []);
  } finally {
    await store.close();
  }
});

function temporaryDatabasePath(label: string): string {
  return join(tmpdir(), `${label}-${process.pid}-${Date.now()}-${Math.random()}.sqlite`);
}

function removeDatabase(databasePath: string): void {
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
}
