import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { DeploymentOrchestrator } from "../../src/core/deployment-orchestrator.js";
import { resolveJobCase } from "../../src/core/job-definition.js";
import { OrchestratorStore } from "../../src/database/store.js";
import {
  listCloudDeploymentCases,
  loadCloudDeploymentCase,
} from "../../src/interfaces/cli/app.js";
import { FakeCloudStackClient } from "../../src/requests/client.js";
import { createDeploymentSteps } from "../../src/requests/deployment-steps.js";
import type { JsonValue } from "../../src/types.js";

interface FakeApi {
  baseUrl: string;
  requests: URL[];
  close: () => Promise<void>;
}

const casesDirectory = join(process.cwd(), "src", "interfaces", "cli", "cases");
const definitionSteps = createDeploymentSteps(new FakeCloudStackClient({
  baseUrl: "https://definition.test/api",
}));

test("resolves separate stored DAGs with and without public IP", async () => {
  const withoutPublicIpCase = await loadCloudDeploymentCase(
    join(casesDirectory, "01.without-public-ip.json"),
  );
  const withoutPublicIp = resolveJobCase(
    await loadDeployVmDefinition(withoutPublicIpCase.jobId),
    withoutPublicIpCase,
    definitionSteps,
  );
  assert.deepEqual(
    withoutPublicIp.map((job) => [job.id, job.dependsOn]),
    [
      ["vpc", []],
      ["subnet", ["vpc"]],
      ["acl-list", ["vpc"]],
      ["acl-rule", ["acl-list"]],
      ["attach-acl", ["subnet", "acl-list"]],
      ["vm", ["subnet"]],
    ],
  );

  const withPublicIpCase = await loadCloudDeploymentCase(
    join(casesDirectory, "02.with-public-ip.json"),
  );
  const withPublicIp = resolveJobCase(
    await loadDeployVmDefinition(withPublicIpCase.jobId),
    withPublicIpCase,
    definitionSteps,
  );
  assert.deepEqual(withPublicIp.at(-2), {
    id: "public-ip",
    type: "public-ip",
    dependsOn: [],
    input: {},
    apiControl: { delay: 0, timeout: 0, result: 1 },
    maxRetries: 1,
  });
  assert.deepEqual(withPublicIp.at(-1)?.dependsOn, ["vm", "public-ip"]);
});

test("loads the six focused deployment cases", async () => {
  const failedCase = await loadCloudDeploymentCase(join(casesDirectory, "05.failed-job.json"));
  const retryStatusCase = await loadCloudDeploymentCase(
    join(casesDirectory, "06.retry-jobstatus-2.json"),
  );
  const parallelAclCase = await loadCloudDeploymentCase(
    join(casesDirectory, "03.parallel-acl-rules.json"),
  );
  assert.equal(failedCase.jobId, "deploy-vm-without-public-ip");
  assert.equal(failedCase.defaults?.config?.maxRetries, 1);
  assert.deepEqual(failedCase.steps["acl-rule"]?.input, {
    protocol: "tcp",
    cidrList: "10.20.1.0/24",
    action: "allow",
    trafficType: "Ingress",
    startPort: 22,
    endPort: 22,
  });
  assert.deepEqual(failedCase.steps["acl-rule"]?.apiControl, {
    result: 2,
  });
  assert.equal(failedCase.steps["acl-rule"]?.config?.maxRetries, 2);
  assert.deepEqual(retryStatusCase.steps["acl-rule"]?.apiControl, {
    resultSequence: [2, 1],
  });
  assert.deepEqual(retryStatusCase.steps["acl-rule"]?.config, {
    maxRetries: 1,
  });
  assert.deepEqual(
    resolveJobCase(
      await loadDeployVmDefinition(retryStatusCase.jobId),
      retryStatusCase,
      definitionSteps,
    ).find((job) => job.id === "acl-rule")?.apiControl,
    { delay: 0, timeout: 0, result: 1, resultSequence: [2, 1] },
  );
  assert.deepEqual(failedCase.steps.vm?.input, {
    name: "wowdev-vm",
    serviceOfferingId: "offering-1",
    templateId: "template-1",
  });
  assert.deepEqual(failedCase.defaults?.apiControl, {
    delay: 0, timeout: 0, result: 1,
  });
  assert.deepEqual(
    Object.keys(parallelAclCase.steps["acl-rule"]?.instances ?? {}),
    ["ssh", "http", "https", "dns", "icmp"],
  );

  assert.equal(
    resolveJobCase(
      await loadDeployVmDefinition(failedCase.jobId),
      failedCase,
      definitionSteps,
    ).length,
    6,
  );
  assert.equal(
    resolveJobCase(
      await loadDeployVmDefinition(parallelAclCase.jobId),
      parallelAclCase,
      definitionSteps,
    ).length,
    10,
  );

  assert.deepEqual(
    (await listCloudDeploymentCases(casesDirectory))
      .map(({ filename, index, description }) => ({ filename, index, description })),
    [
      {
        filename: "01.without-public-ip.json",
        index: 1,
        description: "Deploy VM tanpa public IP",
      },
      {
        filename: "02.with-public-ip.json",
        index: 2,
        description: "Deploy VM dengan public IP",
      },
      {
        filename: "03.parallel-acl-rules.json",
        index: 3,
        description: "Lima ACL rule berjalan paralel",
      },
      {
        filename: "04.failed-static-nat.json",
        index: 4,
        description: "Static NAT gagal; rollback VPC sukses setelah retry",
      },
      {
        filename: "05.failed-job.json",
        index: 5,
        description: "Job gagal, retry, lalu rollback",
      },
      {
        filename: "06.retry-jobstatus-2.json",
        index: 6,
        description: "Jobstatus 2, retry, lalu sukses",
      },
    ],
  );
});

test("loads a public-IP case configured to fail static NAT", async () => {
  const deploymentCase = await loadCloudDeploymentCase(
    join(casesDirectory, "04.failed-static-nat.json"),
  );
  const jobs = resolveJobCase(
    await loadDeployVmDefinition(deploymentCase.jobId),
    deploymentCase,
    definitionSteps,
  );

  assert.equal(deploymentCase.jobId, "deploy-vm-with-public-ip");
  assert.equal(jobs.length, 8);
  assert.deepEqual(jobs.find((job) => job.id === "vpc"), {
    id: "vpc",
    type: "vpc",
    dependsOn: [],
    input: { cidr: "10.20.0.0/16", name: "wowdev-vpc" },
    apiControl: {
      delay: 0,
      timeout: 0,
      result: 1,
      rollbackResultSequence: [2, 1],
    },
    maxRetries: 1,
    maxRollbackRetries: 1,
  });
  assert.deepEqual(jobs.find((job) => job.id === "static-nat"), {
    id: "static-nat",
    type: "static-nat",
    dependsOn: ["vm", "public-ip"],
    input: {},
    apiControl: { delay: 0, timeout: 0, result: 2 },
    maxRetries: 2,
  });
});

test("retries failed static NAT and rolls back its public-IP deployment", async () => {
  const api = await startFakeApi();
  const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    deploymentSteps: createDeploymentSteps(client),
  });

  try {
    const deploymentCase = await loadCloudDeploymentCase(
      join(casesDirectory, "04.failed-static-nat.json"),
    );
    const result = await orchestrator.deployCase(deploymentCase);
    const jobs = Object.fromEntries(result.jobs.map((job) => [job.jobId, job]));

    assert.equal(result.jobRun.status, "ROLLED_BACK");
    assert.equal(jobs["static-nat"]?.status, "FAILED");
    assert.equal(jobs["static-nat"]?.attempt, 3);
    assert.equal(jobs["public-ip"]?.status, "ROLLBACK_SKIPPED");
    assert.equal(jobs.vm?.status, "ROLLED_BACK");
    assert.equal(jobs.subnet?.status, "ROLLED_BACK");
    assert.equal(jobs.vpc?.status, "ROLLED_BACK");
    assert.equal(jobs.vpc?.rollbackAttempt, 2);

    const commands = api.requests.map((url) => url.searchParams.get("command"));
    assert.equal(commands.filter((command) => command === "enableStaticNat").length, 3);
    assert(commands.includes("listPublicIpAddresses"));
    assert(commands.includes("destroyVirtualMachine"));
    assert(commands.includes("deleteNetwork"));
    assert(commands.includes("deleteVpc"));
    for (const request of api.requests.filter(
      (url) => url.searchParams.get("command") === "enableStaticNat",
    )) {
      assert.equal(request.searchParams.get("result"), "2");
    }
    assert.deepEqual(
      api.requests
        .filter((url) => url.searchParams.get("command") === "deleteVpc")
        .map((url) => url.searchParams.get("result")),
      ["2", "1"],
    );
  } finally {
    await orchestrator.close();
    await api.close();
  }
});

test("expands one stored ACL step into independently tracked case instances", async () => {
  const api = await startFakeApi();
  const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    deploymentSteps: createDeploymentSteps(client),
  });

  try {
    const deploymentCase = await loadCloudDeploymentCase(
      join(casesDirectory, "03.parallel-acl-rules.json"),
    );
    if (deploymentCase.defaults?.config !== undefined) {
      deploymentCase.defaults.config.maxRetries = 0;
    }

    const jobRunId = await orchestrator.createJobRunFromCase(deploymentCase);
    assert.deepEqual(
      (await orchestrator.store.getJobDefinitions(jobRunId))
        .filter(({ type }) => type === "acl-rule")
        .map(({ id }) => id),
      [
        "acl-rule:ssh",
        "acl-rule:http",
        "acl-rule:https",
        "acl-rule:dns",
        "acl-rule:icmp",
      ],
    );

    const result = await orchestrator.runJobRun(jobRunId);
    assert.equal(result.jobRun.status, "SUCCESS");
    assert.deepEqual(
      result.jobs
        .filter(({ type }) => type === "acl-rule")
        .map(({ jobId, status }) => ({ jobId, status })),
      [
        { jobId: "acl-rule:ssh", status: "SUCCESS" },
        { jobId: "acl-rule:http", status: "SUCCESS" },
        { jobId: "acl-rule:https", status: "SUCCESS" },
        { jobId: "acl-rule:dns", status: "SUCCESS" },
        { jobId: "acl-rule:icmp", status: "SUCCESS" },
      ],
    );
    assert.equal(
      api.requests.filter((url) => url.searchParams.get("command") === "createNetworkACL")
        .length,
      5,
    );
    assert.deepEqual(
      (await orchestrator.store.getJobDefinition(deploymentCase.jobId)).stepIds
        .filter((stepId) => stepId === "acl-rule"),
      ["acl-rule"],
    );
  } finally {
    await orchestrator.close();
    await api.close();
  }
});

test("executes every API command required for a deployment with public IP", async () => {
  const api = await startFakeApi();
  const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    deploymentSteps: createDeploymentSteps(client),
  });

  try {
    const deploymentCase = await loadCloudDeploymentCase(
      join(casesDirectory, "02.with-public-ip.json"),
    );
    if (deploymentCase.defaults?.config !== undefined) {
      deploymentCase.defaults.config.maxRetries = 0;
    }
    const result = await orchestrator.deployCase(deploymentCase);
    assert.equal(result.jobRun.status, "SUCCESS");
    assert.equal(result.jobRun.jobDefinitionId, "deploy-vm-with-public-ip");
    assert(result.jobs.every((job) => job.status === "SUCCESS"));
    assert.equal(
      (await orchestrator.store.getJobDefinition("deploy-vm-with-public-ip")).stepIds.length,
      8,
    );

    const commands = api.requests.map((url) => url.searchParams.get("command"));
    for (const expected of [
      "createVpc",
      "createNetwork",
      "createNetworkACLList",
      "createNetworkACL",
      "replaceNetworkACLList",
      "deployVirtualMachine",
      "listPublicIpAddresses",
      "enableStaticNat",
    ]) {
      assert(commands.includes(expected), `missing API command ${expected}`);
    }
    for (const request of api.requests.filter(
      (url) => url.searchParams.get("command") !== "queryAsyncJobResult",
    )) {
      assert.equal(request.searchParams.get("delay"), "0");
      assert.equal(request.searchParams.get("timeout"), "0");
      assert.equal(request.searchParams.get("result"), "1");
    }
    const deployVm = api.requests.find(
      (url) => url.searchParams.get("command") === "deployVirtualMachine",
    );
    assert.equal(deployVm?.searchParams.get("serviceofferingid"), "offering-1");
    assert.equal(deployVm?.searchParams.get("templateid"), "template-1");
    const staticNat = api.requests.find(
      (url) => url.searchParams.get("command") === "enableStaticNat",
    );
    assert.equal(staticNat?.searchParams.get("networkid"), "network-1");
    assert.equal(staticNat?.searchParams.get("ipaddressid"), "public-ip-1");
    assert.equal(staticNat?.searchParams.get("virtualmachineid"), "vm-1");
  } finally {
    await orchestrator.close();
    await api.close();
  }
});

test("turns jobstatus=2 into failure and calls documented rollback APIs", async () => {
  const api = await startFakeApi();
  const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    deploymentSteps: createDeploymentSteps(client),
  });

  try {
    const deploymentCase = await loadCloudDeploymentCase(
      join(casesDirectory, "05.failed-job.json"),
    );
    if (deploymentCase.defaults?.config !== undefined) {
      deploymentCase.defaults.config.maxRetries = 0;
    }
    if (deploymentCase.steps["acl-rule"]?.config !== undefined) {
      deploymentCase.steps["acl-rule"].config.maxRetries = 0;
    }
    const result = await orchestrator.deployCase(deploymentCase);
    const states = Object.fromEntries(result.jobs.map((job) => [job.jobId, job.status]));
    assert.equal(result.jobRun.status, "ROLLED_BACK");
    assert.equal(states["acl-rule"], "FAILED");
    assert.equal(states["attach-acl"], "ROLLBACK_SKIPPED");
    assert.equal(states.vm, "ROLLED_BACK");
    assert.equal(states.subnet, "ROLLED_BACK");
    assert.equal(states.vpc, "ROLLED_BACK");

    const commands = api.requests.map((url) => url.searchParams.get("command"));
    assert(commands.includes("deleteNetwork"));
    assert(commands.includes("deleteVpc"));
    assert(commands.includes("destroyVirtualMachine"));
    assert(commands.includes("replaceNetworkACLList"));
    assert(commands.includes("deployVirtualMachine"));
    assert(
      commands.indexOf("destroyVirtualMachine") < commands.indexOf("deleteNetwork"),
      "VM must be destroyed before its network",
    );
  } finally {
    await orchestrator.close();
    await api.close();
  }
});

test("demo case succeeds when the first retry is executed", async () => {
  const api = await startFakeApi();
  const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    deploymentSteps: createDeploymentSteps(client),
  });

  try {
    const deploymentCase = await loadCloudDeploymentCase(
      join(casesDirectory, "06.retry-jobstatus-2.json"),
    );
    const result = await orchestrator.deployCase(deploymentCase);
    const aclRule = result.jobs.find((job) => job.jobId === "acl-rule");
    const aclRequests = api.requests.filter(
      (url) => url.searchParams.get("command") === "createNetworkACL",
    );

    assert.equal(result.jobRun.status, "SUCCESS");
    assert.equal(aclRule?.status, "SUCCESS");
    assert.equal(aclRule?.attempt, 2);
    assert.deepEqual(
      aclRequests.map((url) => url.searchParams.get("result")),
      ["2", "1"],
    );
  } finally {
    await orchestrator.close();
    await api.close();
  }
});

async function loadDeployVmDefinition(jobId: string) {
  const store = new OrchestratorStore(":memory:");
  try {
    return await store.getJobDefinition(jobId);
  } finally {
    await store.close();
  }
}

async function startFakeApi(): Promise<FakeApi> {
  const requests: URL[] = [];
  const asyncJobs = new Map<string, { result: JsonValue; failed: boolean }>();
  const originalFetch = globalThis.fetch;
  let nextJob = 1;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    const command = url.searchParams.get("command") ?? "";
    const send = (body: JsonValue): Response => new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const envelope = (value: JsonValue): JsonValue => ({
      [`${command.toLowerCase()}response`]: value,
    });

    if (command === "queryAsyncJobResult") {
      const jobId = url.searchParams.get("jobid") ?? "";
      const job = asyncJobs.get(jobId);
      if (job === undefined) {
        return send(envelope({ errorcode: 431, errortext: "Unknown job" }));
      }
      return send(envelope({
        jobid: jobId,
        jobstatus: job.failed ? 2 : 1,
        jobresult: job.result,
      }));
    }

    if (command === "createNetwork") {
      const delaySeconds = Number(url.searchParams.get("delay") ?? 0);
      if (Number.isFinite(delaySeconds) && delaySeconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1_000));
      }
      return send(envelope({
        network: {
          id: "network-1",
          name: url.searchParams.get("name") ?? "network",
          vpcid: url.searchParams.get("vpcid") ?? "",
          gateway: url.searchParams.get("gateway") ?? "",
          netmask: url.searchParams.get("netmask") ?? "",
        },
      }));
    }
    if (command === "listPublicIpAddresses") {
      return send(envelope({
        publicipaddress: [
          { id: "used-ip", state: "Allocated" },
          { id: "public-ip-1", ipaddress: "192.0.2.10", state: "Free" },
        ],
      }));
    }
    if (command === "enableStaticNat") {
      return send(envelope(url.searchParams.get("result") === "2"
        ? { errorcode: 500, cserrorcode: 9999, errortext: "Simulated static NAT failure" }
        : { success: true }));
    }

    const resultByCommand: Record<string, JsonValue> = {
      createVpc: { vpc: { id: "vpc-1", cidr: url.searchParams.get("cidr") ?? "" } },
      createNetworkACLList: {
        networkacllist: { id: "acl-list-1", vpcid: url.searchParams.get("vpcid") ?? "" },
      },
      createNetworkACL: {
        networkacl: {
          id: "acl-rule-1",
          aclid: url.searchParams.get("aclid") ?? "",
          protocol: url.searchParams.get("protocol") ?? "",
        },
      },
      replaceNetworkACLList: { success: true },
      deployVirtualMachine: {
        virtualmachine: { id: "vm-1", networkid: url.searchParams.get("networkids") ?? "" },
      },
      destroyVirtualMachine: { success: true },
      deleteNetwork: { success: true },
      deleteVpc: { success: true },
    };
    const result = resultByCommand[command];
    if (result === undefined) {
      return send(envelope({ errorcode: 400, errortext: `Unsupported command ${command}` }));
    }
    const jobId = `job-${nextJob}`;
    nextJob += 1;
    const failed = url.searchParams.get("result") === "2";
    asyncJobs.set(jobId, {
      failed,
      result: failed
        ? { errorcode: 500, cserrorcode: 9999, errortext: "Simulated job failure" }
        : result,
    });
    return send(envelope({ jobid: jobId }));
  };

  return {
    baseUrl: "https://fake-api.test/api/api",
    requests,
    close: async () => {
      globalThis.fetch = originalFetch;
    },
  };
}
