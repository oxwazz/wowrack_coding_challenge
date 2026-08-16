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
    join(casesDirectory, "01.success-without-public-ip.json"),
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
    join(casesDirectory, "02.success-with-public-ip.json"),
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
    maxRetries: 4,
    maxRollbackRetries: 4,
    maxTimeout: 30,
  });
  assert.deepEqual(withPublicIp.at(-1)?.dependsOn, ["vm", "public-ip"]);
});

test("loads the focused deployment cases", async () => {
  const timeoutCase = await loadCloudDeploymentCase(
    join(casesDirectory, "04.success-after-two-timeouts-40s.json"),
  );
  const delayCase = await loadCloudDeploymentCase(
    join(casesDirectory, "05.success-after-two-delays-40s.json"),
  );
  const retryStatusCase = await loadCloudDeploymentCase(
    join(casesDirectory, "06.success-after-retry-jobstatus-2.json"),
  );
  const parallelAclCase = await loadCloudDeploymentCase(
    join(casesDirectory, "03.success-parallel-acl-rules.json"),
  );
  const rollbackTimeoutCase = await loadCloudDeploymentCase(
    join(casesDirectory, "07.rolled-back-after-timeouts.json"),
  );
  const rollbackDelayCase = await loadCloudDeploymentCase(
    join(casesDirectory, "08.rolled-back-after-delays.json"),
  );
  const rollbackStatusCase = await loadCloudDeploymentCase(
    join(casesDirectory, "09.rolled-back-after-jobstatus-2.json"),
  );
  const rollbackAclRuleCase = await loadCloudDeploymentCase(
    join(casesDirectory, "10.rolled-back-after-acl-rule-failure.json"),
  );
  const rollbackStaticNatCase = await loadCloudDeploymentCase(
    join(casesDirectory, "11.rolled-back-after-static-nat-failure.json"),
  );
  assert.deepEqual(timeoutCase.steps["acl-rule"]?.apiControl, {
    timeoutSequence: [40, 40, 0, 0, 0],
    resultSequence: [2, 2, 1, 1, 1],
  });
  assert.equal(timeoutCase.defaults?.config?.maxRetries, 4);
  assert.equal(timeoutCase.defaults?.config?.maxTimeout, 30);
  assert.deepEqual(delayCase.steps["acl-rule"]?.apiControl, {
    delaySequence: [40, 40, 0, 0, 0],
    resultSequence: [2, 2, 1, 1, 1],
  });
  assert.equal(delayCase.defaults?.config?.maxRetries, 4);
  assert.equal(delayCase.defaults?.config?.maxTimeout, 30);
  assert.deepEqual(retryStatusCase.steps["acl-rule"]?.apiControl, {
    resultSequence: [2, 2, 1, 1, 1],
  });
  assert.equal(retryStatusCase.defaults?.config?.maxRetries, 4);
  assert.deepEqual(
    resolveJobCase(
      await loadDeployVmDefinition(retryStatusCase.jobId),
      retryStatusCase,
      definitionSteps,
    ).find((job) => job.id === "acl-rule")?.apiControl,
    { delay: 0, timeout: 0, result: 1, resultSequence: [2, 2, 1, 1, 1] },
  );
  assert.deepEqual(
    Object.keys(parallelAclCase.steps["acl-rule"]?.instances ?? {}),
    ["ssh", "http", "https", "dns", "icmp"],
  );
  assert.equal(
    resolveJobCase(
      await loadDeployVmDefinition(parallelAclCase.jobId),
      parallelAclCase,
      definitionSteps,
    ).length,
    10,
  );
  assert.deepEqual(rollbackTimeoutCase.steps.subnet?.apiControl, {
    timeoutSequence: [40, 40, 40, 40, 40],
    resultSequence: [2, 2, 2, 2, 2],
  });
  assert.deepEqual(rollbackDelayCase.steps.subnet?.apiControl, {
    delaySequence: [40, 40, 40, 40, 40],
    resultSequence: [2, 2, 2, 2, 2],
  });
  assert.deepEqual(rollbackStatusCase.steps.subnet?.apiControl, {
    timeout: 2,
    resultSequence: [2, 2, 2, 2, 2],
  });
  assert.equal(rollbackAclRuleCase.jobId, "deploy-vm-without-public-ip");
  assert.deepEqual(rollbackAclRuleCase.steps["acl-rule"]?.apiControl, { result: 2 });
  assert.equal(rollbackAclRuleCase.defaults?.config?.maxRollbackRetries, 4);
  assert.equal(rollbackStaticNatCase.jobId, "deploy-vm-with-public-ip");
  assert.deepEqual(rollbackStaticNatCase.steps["static-nat"]?.apiControl, {
    timeout: 2,
    result: 2,
  });
  assert.equal(rollbackStaticNatCase.defaults?.config?.maxRollbackRetries, 4);
  assert.deepEqual(rollbackAclRuleCase.steps.vm?.apiControl, {
    rollbackResultSequence: [2, 2, 1],
  });
  assert.deepEqual(rollbackStaticNatCase.steps.vm?.apiControl, {
    rollbackResultSequence: [2, 2, 1],
  });
  assert.equal(rollbackStaticNatCase.steps.vm?.config?.maxRollbackRetries, 2);
  for (const deploymentCase of [rollbackTimeoutCase, rollbackDelayCase, rollbackStatusCase]) {
    assert.equal(deploymentCase.defaults?.config?.maxTimeout, 30);
    assert.equal(deploymentCase.defaults?.config?.maxRetries, 4);
  }

  assert.deepEqual(
    (await listCloudDeploymentCases(casesDirectory))
      .map(({ filename, index, description }) => ({ filename, index, description })),
    [
      {
        filename: "01.success-without-public-ip.json",
        index: 1,
        description: "Success - Deploy VM tanpa public IP",
      },
      {
        filename: "02.success-with-public-ip.json",
        index: 2,
        description: "Success - Deploy VM dengan public IP",
      },
      {
        filename: "03.success-parallel-acl-rules.json",
        index: 3,
        description: "Success - Lima ACL rule berjalan paralel",
      },
      {
        filename: "04.success-after-two-timeouts-40s.json",
        index: 4,
        description: "Success - Dua kali timeout 40 detik, retry, lalu sukses",
      },
      {
        filename: "05.success-after-two-delays-40s.json",
        index: 5,
        description: "Success - Dua kali delay 40 detik, retry, lalu sukses",
      },
      {
        filename: "06.success-after-retry-jobstatus-2.json",
        index: 6,
        description: "Success - Jobstatus 2, retry, lalu sukses",
      },
      {
        filename: "07.rolled-back-after-timeouts.json",
        index: 7,
        description: "Rolled back - Subnet terus timeout sampai retry habis",
      },
      {
        filename: "08.rolled-back-after-delays.json",
        index: 8,
        description: "Rolled back - Subnet terus delay sampai retry habis",
      },
      {
        filename: "09.rolled-back-after-jobstatus-2.json",
        index: 9,
        description: "Rolled back - Subnet terus mendapat jobstatus 2 sampai retry habis",
      },
      {
        filename: "10.rolled-back-after-acl-rule-failure.json",
        index: 10,
        description: "Rolled back - Create ACL rule gagal tanpa public IP",
      },
      {
        filename: "11.rolled-back-after-static-nat-failure.json",
        index: 11,
        description: "Rolled back - Create static NAT gagal dengan public IP",
      },
    ],
  );
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
      join(casesDirectory, "03.success-parallel-acl-rules.json"),
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
      join(casesDirectory, "02.success-with-public-ip.json"),
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

test("demo case succeeds after two retries", async () => {
  const api = await startFakeApi();
  const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    deploymentSteps: createDeploymentSteps(client),
  });

  try {
    const deploymentCase = await loadCloudDeploymentCase(
      join(casesDirectory, "06.success-after-retry-jobstatus-2.json"),
    );
    const result = await orchestrator.deployCase(deploymentCase);
    const aclRule = result.jobs.find((job) => job.jobId === "acl-rule");
    const aclRequests = api.requests.filter(
      (url) => url.searchParams.get("command") === "createNetworkACL",
    );

    assert.equal(result.jobRun.status, "SUCCESS");
    assert.equal(aclRule?.status, "SUCCESS");
    assert.equal(aclRule?.attempt, 3);
    assert.deepEqual(
      aclRequests.map((url) => url.searchParams.get("result")),
      ["2", "2", "1"],
    );
  } finally {
    await orchestrator.close();
    await api.close();
  }
});

test("timing sequence cases succeed after two retries", async () => {
  const cases = [
    {
      filename: "04.success-after-two-timeouts-40s.json",
      parameter: "timeout",
    },
    {
      filename: "05.success-after-two-delays-40s.json",
      parameter: "delay",
    },
  ] as const;

  for (const timingCase of cases) {
    const api = await startFakeApi();
    const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
    const orchestrator = new DeploymentOrchestrator({
      databasePath: ":memory:",
      deploymentSteps: createDeploymentSteps(client),
    });

    try {
      const deploymentCase = await loadCloudDeploymentCase(
        join(casesDirectory, timingCase.filename),
      );
      const result = await orchestrator.deployCase(deploymentCase);
      const aclRule = result.jobs.find((job) => job.jobId === "acl-rule");
      const aclRequests = api.requests.filter(
        (url) => url.searchParams.get("command") === "createNetworkACL",
      );

      assert.equal(result.jobRun.status, "SUCCESS");
      assert.equal(aclRule?.status, "SUCCESS");
      assert.equal(aclRule?.attempt, 3);
      assert.deepEqual(
        aclRequests.map((url) => url.searchParams.get(timingCase.parameter)),
        ["40", "40", "0"],
      );
    } finally {
      await orchestrator.close();
      await api.close();
    }
  }
});

test("failure sequence cases roll back after all retries are exhausted", async () => {
  const cases = [
    { filename: "07.rolled-back-after-timeouts.json", expectedAttempts: 5 },
    { filename: "08.rolled-back-after-delays.json", expectedAttempts: 5 },
    { filename: "09.rolled-back-after-jobstatus-2.json", expectedAttempts: 5 },
  ];

  for (const { filename, expectedAttempts } of cases) {
    const api = await startFakeApi();
    const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
    const orchestrator = new DeploymentOrchestrator({
      databasePath: ":memory:",
      deploymentSteps: createDeploymentSteps(client),
    });

    try {
      const deploymentCase = await loadCloudDeploymentCase(join(casesDirectory, filename));
      const result = await orchestrator.deployCase(deploymentCase);
      const states = Object.fromEntries(
        result.jobs.map((job) => [job.jobId, job.status]),
      );

      assert.equal(result.jobRun.status, "ROLLED_BACK", filename);
      assert.equal(states.subnet, "FAILED", filename);
      assert.equal(states.vpc, "ROLLED_BACK", filename);
      assert.equal(
        result.jobs.find((job) => job.jobId === "subnet")?.attempt,
        expectedAttempts,
        filename,
      );
    } finally {
      await orchestrator.close();
      await api.close();
    }
  }
});

test("API failure cases roll back deployments with and without public IP", async () => {
  const cases = [
    {
      filename: "10.rolled-back-after-acl-rule-failure.json",
      failedJobId: "acl-rule",
      failedCommand: "createNetworkACL",
    },
    {
      filename: "11.rolled-back-after-static-nat-failure.json",
      failedJobId: "static-nat",
      failedCommand: "enableStaticNat",
    },
  ] as const;

  for (const failureCase of cases) {
    const api = await startFakeApi();
    const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
    const orchestrator = new DeploymentOrchestrator({
      databasePath: ":memory:",
      deploymentSteps: createDeploymentSteps(client),
    });

    try {
      const deploymentCase = await loadCloudDeploymentCase(
        join(casesDirectory, failureCase.filename),
      );
      const result = await orchestrator.deployCase(deploymentCase);
      const states = Object.fromEntries(result.jobs.map((job) => [job.jobId, job.status]));
      const failedRequests = api.requests.filter(
        (url) => url.searchParams.get("command") === failureCase.failedCommand,
      );

      assert.equal(result.jobRun.status, "ROLLED_BACK", failureCase.filename);
      assert.equal(states[failureCase.failedJobId], "FAILED", failureCase.filename);
      assert.equal(states.vpc, "ROLLED_BACK", failureCase.filename);
      assert.equal(
        result.jobs.find((job) => job.jobId === failureCase.failedJobId)?.attempt,
        5,
        failureCase.filename,
      );
      assert.deepEqual(
        failedRequests.map((url) => url.searchParams.get("result")),
        ["2", "2", "2", "2", "2"],
        failureCase.filename,
      );
    } finally {
      await orchestrator.close();
      await api.close();
    }
  }
});

test("deployment case overrides the orchestrator attempt timeout", async () => {
  const api = await startFakeApi();
  const client = new FakeCloudStackClient({ baseUrl: api.baseUrl });
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    deploymentSteps: createDeploymentSteps(client),
    jobTimeoutMs: 5,
  });

  try {
    const deploymentCase = await loadCloudDeploymentCase(
      join(casesDirectory, "01.success-without-public-ip.json"),
    );
    deploymentCase.defaults ??= {};
    deploymentCase.defaults.config = {
      ...deploymentCase.defaults.config,
      maxRetries: 0,
      maxTimeout: 0.1,
    };
    deploymentCase.steps.subnet!.apiControl = { delay: 0.02 };

    const result = await orchestrator.deployCase(deploymentCase);

    assert.equal(result.jobRun.status, "SUCCESS");
    assert.equal(
      result.jobs.find(({ jobId }) => jobId === "subnet")?.status,
      "SUCCESS",
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
      const simulatedFailure = url.searchParams.get("result") === "2"
        || Number(url.searchParams.get("timeout") ?? 0) > 0
        || delaySeconds >= 1;
      if (simulatedFailure) {
        return send(envelope({
          errorcode: 500,
          cserrorcode: 9999,
          errortext: "Simulated network failure",
        }));
      }
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
    const failed = url.searchParams.get("result") === "2"
      || Number(url.searchParams.get("timeout") ?? 0) > 0
      || Number(url.searchParams.get("delay") ?? 0) > 0;
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
