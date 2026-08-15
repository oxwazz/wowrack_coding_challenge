#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Box, render, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { FakeCloudStackClient } from "../../requests/client.js";
import { createCloudStackHandlers } from "../../requests/handlers.js";
import { CLI_DEFAULTS, cloudStackApiUrl } from "../../constants.js";
import { errorMessage } from "../../utils.js";
import { DeploymentOrchestrator } from "../../core.js";
import type {
  CloudDeploymentCase,
  JobRunRecord,
  JobRunResult,
  InteractiveCliOptions,
  JobStepRunRecord,
  JobStatus,
} from "../../types.js";

interface InteractiveExitResult {
  exitCode: number;
}

export interface CloudDeploymentCaseSummary {
  id: string;
  filename: string;
  index: number;
  description: string;
}

type Screen =
  | "menu"
  | "case"
  | "confirm"
  | "running"
  | "interrupted"
  | "reset"
  | "done"
  | "error";

export async function loadCloudDeploymentCase(
  filename: string,
): Promise<CloudDeploymentCase> {
  try {
    return JSON.parse(await readFile(filename, "utf8")) as CloudDeploymentCase;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in case file ${filename}: ${error.message}`);
    }
    throw error;
  }
}

export async function listCloudDeploymentCases(
  directory: string,
): Promise<CloudDeploymentCaseSummary[]> {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".json")
    .map((entry) => entry.name);
  const cases = await Promise.all(files.map(async (filename) => {
    const deploymentCase = await loadCloudDeploymentCase(resolve(directory, filename));
    const id = caseIdFromFilename(filename);
    return {
      id,
      filename,
      index: caseIndex(filename),
      description: caseDescription(id, deploymentCase),
    };
  }));
  return cases.sort((left, right) =>
    left.index - right.index || left.filename.localeCompare(right.filename));
}

export async function runInteractiveCli(options: InteractiveCliOptions): Promise<number> {
  const cases = await listCloudDeploymentCases(options.casesDirectory);
  const instance = render(
    <App {...options} cases={cases} />,
    { alternateScreen: true, exitOnCtrlC: false, incrementalRendering: true },
  );
  const result = await instance.waitUntilExit();
  return isInteractiveExitResult(result) ? result.exitCode : 0;
}

export async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error("CLI hanya mendukung mode interaktif. Jalankan: npm run cli");
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("CLI interaktif membutuhkan terminal TTY.");
  }
  const databasePath = resolve(CLI_DEFAULTS.databaseFile);
  const casesDirectory = resolve(CLI_DEFAULTS.casesDirectory);
  const endpoint = cloudStackApiUrl();
  const client = new FakeCloudStackClient({
    baseUrl: endpoint,
  });
  const orchestrator = new DeploymentOrchestrator({
    databasePath,
    handlers: createCloudStackHandlers(client),
    jobTimeoutMs: CLI_DEFAULTS.jobTimeoutMs,
    maxRetries: CLI_DEFAULTS.maxRetries,
  });
  try {
    process.exitCode = await runInteractiveCli({
      orchestrator,
      casesDirectory,
      databasePath,
      endpoint,
      maxRetries: CLI_DEFAULTS.maxRetries,
    });
  } finally {
    await orchestrator.close();
  }
}

function App({
  orchestrator,
  casesDirectory,
  databasePath,
  endpoint,
  maxRetries,
  cases,
}: InteractiveCliOptions & { cases: CloudDeploymentCaseSummary[] }) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("menu");
  const [deploymentCase, setDeploymentCase] = useState<CloudDeploymentCase>();
  const [caseSummary, setCaseSummary] = useState<CloudDeploymentCaseSummary>();
  const [result, setResult] = useState<JobRunResult>();
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState<number>();
  const [failure, setFailure] = useState("");
  const [lastExitCode, setLastExitCode] = useState(0);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      process.exit(130);
    }
  });

  const showFailure = useCallback((error: unknown) => {
    setFailure(errorMessage(error));
    setLastExitCode(1);
    setScreen("error");
  }, []);

  const showCompletion = useCallback((value: JobRunResult, elapsedMs: number) => {
    setResult(value);
    setElapsedMilliseconds(elapsedMs);
    setLastExitCode(value.jobRun.status === "SUCCESS" ? 0 : 1);
    setScreen("done");
  }, []);

  const startNewFlow = useCallback(() => {
    setDeploymentCase(undefined);
    setCaseSummary(undefined);
    setResult(undefined);
    setElapsedMilliseconds(undefined);
    setFailure("");
    setLastExitCode(0);
    setScreen("case");
  }, []);

  const selectCase = useCallback(async (selected: CloudDeploymentCaseSummary) => {
    try {
      const selectedCase = await loadCloudDeploymentCase(
        resolve(casesDirectory, selected.filename),
      );
      setDeploymentCase(selectedCase);
      setCaseSummary(selected);
      setScreen("confirm");
    } catch (error) {
      showFailure(error);
    }
  }, [casesDirectory, showFailure]);

  const start = useCallback(() => {
    if (deploymentCase !== undefined) setScreen("running");
  }, [deploymentCase]);

  return (
    <Box flexDirection="column">
      <Header />

      {screen === "menu" && (
        <MainMenu
          onNew={startNewFlow}
          onInterrupted={() => setScreen("interrupted")}
          onReset={() => setScreen("reset")}
          onExit={() => exit({ exitCode: lastExitCode } satisfies InteractiveExitResult)}
        />
      )}

      {screen === "case" && (
        <CasePicker
          cases={cases}
          onSelect={selectCase}
          onBack={() => setScreen("menu")}
        />
      )}
      {screen === "confirm" && deploymentCase !== undefined && caseSummary !== undefined && (
        <Confirm
          caseSummary={caseSummary}
          deploymentCase={deploymentCase}
          databasePath={databasePath}
          endpoint={endpoint}
          maxRetries={maxRetries}
          onStart={start}
          onBack={() => setScreen("case")}
        />
      )}
      {screen === "running" && deploymentCase !== undefined && (
        <Runner
          orchestrator={orchestrator}
          deploymentCase={deploymentCase}
          onComplete={showCompletion}
          onError={showFailure}
        />
      )}
      {screen === "interrupted" && (
        <InterruptedJobRuns
          orchestrator={orchestrator}
          onBack={() => setScreen("menu")}
          onComplete={showCompletion}
          onError={showFailure}
        />
      )}
      {screen === "reset" && (
        <ResetDatabase
          orchestrator={orchestrator}
          onBack={() => setScreen("menu")}
          onError={showFailure}
        />
      )}
      {screen === "done" && result !== undefined && elapsedMilliseconds !== undefined && (
        <ResultView
          result={result}
          elapsedMilliseconds={elapsedMilliseconds}
          onMenu={() => setScreen("menu")}
          onExit={() => exit({ exitCode: lastExitCode } satisfies InteractiveExitResult)}
        />
      )}
      {screen === "error" && (
        <ExitMessage
          message={failure}
          onMenu={() => setScreen("menu")}
          onExit={() => exit({ exitCode: 1 } satisfies InteractiveExitResult)}
        />
      )}
    </Box>
  );
}

function Header() {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">Deployment Job Orchestrator</Text>
      <Text dimColor>Fake CloudStack API · persistent SQLite · DAG scheduler</Text>
    </Box>
  );
}

function MainMenu({
  onNew,
  onInterrupted,
  onReset,
  onExit,
}: {
  onNew: () => void;
  onInterrupted: () => void;
  onReset: () => void;
  onExit: () => void;
}) {
  const options = [
    "Mulai job run baru",
    "Lanjutkan job run yang terputus",
    "Reset database",
    "Keluar",
  ];
  const [selected, setSelected] = useState(0);
  useInput((input, key) => {
    if (key.upArrow) setSelected((value) => wrapIndex(value - 1, options.length));
    if (key.downArrow) setSelected((value) => wrapIndex(value + 1, options.length));
    if (input === "q") onExit();
    if (key.return) [onNew, onInterrupted, onReset, onExit][selected]?.();
  });
  return (
    <Panel title="Menu utama">
      {options.map((label, index) => (
        <MenuRow key={label} label={label} selected={selected === index} />
      ))}
      <Help>↑/↓ pilih · Enter buka · q keluar</Help>
    </Panel>
  );
}

function CasePicker({
  cases,
  onSelect,
  onBack,
}: {
  cases: CloudDeploymentCaseSummary[];
  onSelect: (deploymentCase: CloudDeploymentCaseSummary) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState(0);
  useInput((_input, key) => {
    if (key.escape) onBack();
    if (key.upArrow) setSelected((value) => wrapIndex(value - 1, cases.length));
    if (key.downArrow) setSelected((value) => wrapIndex(value + 1, cases.length));
    if (key.return && cases[selected] !== undefined) onSelect(cases[selected]);
  });
  return (
    <Panel title="Pilih deployment case">
      {cases.length === 0 ? (
        <Text color="yellow">Tidak ada file JSON di folder cases.</Text>
      ) : cases.map((deploymentCase, index) => (
        <MenuRow
          key={deploymentCase.filename}
          label={deploymentCase.description}
          detail={deploymentCase.filename}
          selected={selected === index}
        />
      ))}
      <Help>↑/↓ pilih · Enter lanjut · Esc kembali</Help>
    </Panel>
  );
}

function Confirm({
  caseSummary,
  deploymentCase,
  databasePath,
  endpoint,
  maxRetries,
  onStart,
  onBack,
}: {
  caseSummary: CloudDeploymentCaseSummary;
  deploymentCase: CloudDeploymentCase;
  databasePath: string;
  endpoint: string;
  maxRetries: number;
  onStart: () => void;
  onBack: () => void;
}) {
  const [confirmed, setConfirmed] = useState(true);
  useInput((_input, key) => {
    if (key.escape) onBack();
    if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
      setConfirmed((value) => !value);
    }
    if (key.return) confirmed ? onStart() : onBack();
  });
  return (
    <Panel title="Konfirmasi deployment">
      <SummaryRow label="Case" value={caseSummary.description} />
      <SummaryRow
        label="Service offering"
        value={caseInputString(deploymentCase, "serviceOfferingId")}
      />
      <SummaryRow label="Template" value={caseInputString(deploymentCase, "templateId")} />
      <SummaryRow label="Global timeout" value={`${CLI_DEFAULTS.jobTimeoutMs} ms`} />
      <SummaryRow label="Retry" value={String(deploymentCase.defaults?.maxRetries ?? maxRetries)} />
      <SummaryRow label="Database" value={databasePath} />
      <SummaryRow label="API" value={endpoint} />
      <Box marginTop={1}>
        <Text inverse={confirmed} color={confirmed ? "green" : "white"}> Deploy </Text>
        <Text>  </Text>
        <Text inverse={!confirmed} color={!confirmed ? "yellow" : "white"}> Kembali </Text>
      </Box>
      <Help>←/→ pilih · Enter konfirmasi · Esc kembali</Help>
    </Panel>
  );
}

function Runner({
  orchestrator,
  deploymentCase,
  onComplete,
  onError,
}: {
  orchestrator: DeploymentOrchestrator;
  deploymentCase: CloudDeploymentCase;
  onComplete: (result: JobRunResult, elapsedMilliseconds: number) => void;
  onError: (error: unknown) => void;
}) {
  const [jobRunId, setJobRunId] = useState("");
  const [jobs, setJobs] = useState<JobStepRunRecord[]>([]);
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const startedAt = performance.now();
    void (async () => {
      try {
        const id = await orchestrator.createJobRunFromCase(deploymentCase);
        if (!mounted) return;
        setJobRunId(id);
        const refresh = async () => {
          const current = await orchestrator.store.getJobStepRuns(id);
          if (mounted) setJobs(current);
        };
        await refresh();
        timer = setInterval(() => void refresh().catch(onError), 200);
        const result = await orchestrator.runJobRun(id);
        if (!mounted) return;
        await refresh();
        onComplete(result, performance.now() - startedAt);
      } catch (error) {
        if (mounted) onError(error);
      } finally {
        if (timer !== undefined) clearInterval(timer);
      }
    })();
    return () => {
      mounted = false;
      if (timer !== undefined) clearInterval(timer);
    };
  }, [deploymentCase, onComplete, onError, orchestrator]);

  return (
    <Panel title="Job run berjalan">
      <Text><Spinner /> Menjalankan job</Text>
      {jobRunId !== "" && <Text dimColor>ID: {jobRunId}</Text>}
      <JobTable jobs={jobs} />
      <Help>Status dibaca langsung dari SQLite setiap 200 ms.</Help>
    </Panel>
  );
}

interface InterruptedView {
  jobRun: JobRunRecord;
  jobs: JobStepRunRecord[];
}

function InterruptedJobRuns({
  orchestrator,
  onBack,
  onComplete,
  onError,
}: {
  orchestrator: DeploymentOrchestrator;
  onBack: () => void;
  onComplete: (result: JobRunResult, elapsedMilliseconds: number) => void;
  onError: (error: unknown) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<InterruptedView[]>([]);
  const [selected, setSelected] = useState(0);
  const [resuming, setResuming] = useState(false);

  const resumeSelected = useCallback(() => {
    const selectedView = views[selected];
    if (selectedView === undefined || resuming) return;
    setResuming(true);
    const startedAt = performance.now();
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => {
      const [jobRun, jobs] = await Promise.all([
        orchestrator.store.getJobRun(selectedView.jobRun.id),
        orchestrator.store.getJobStepRuns(selectedView.jobRun.id),
      ]);
      setViews((current) => current.map((view) =>
        view.jobRun.id === jobRun.id ? { jobRun, jobs } : view));
    };
    void (async () => {
      try {
        timer = setInterval(() => void refresh().catch(onError), 200);
        const result = await orchestrator.resumeJobRun(selectedView.jobRun.id);
        await refresh();
        onComplete(result, performance.now() - startedAt);
      } catch (error) {
        setResuming(false);
        onError(error);
      } finally {
        if (timer !== undefined) clearInterval(timer);
      }
    })();
  }, [onComplete, onError, orchestrator, resuming, selected, views]);

  useInput((_input, key) => {
    if (resuming) return;
    if (key.escape || (key.return && views.length === 0)) onBack();
    if (key.upArrow) setSelected((value) => wrapIndex(value - 1, views.length));
    if (key.downArrow) setSelected((value) => wrapIndex(value + 1, views.length));
    if (key.return && views.length > 0) resumeSelected();
  });
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const jobRuns = await orchestrator.listInterruptedJobRuns();
        const loaded = await Promise.all(jobRuns.map(async (jobRun) => ({
          jobRun,
          jobs: await orchestrator.store.getJobStepRuns(jobRun.id),
        })));
        if (mounted) setViews(loaded);
      } catch (error) {
        if (mounted) onError(error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [onError, orchestrator]);

  return (
    <Panel title="Job run yang terputus">
      {loading ? (
        <Text><Spinner /> Membaca SQLite</Text>
      ) : views.length === 0 ? (
        <Text dimColor>Tidak ada job run RUNNING atau ROLLING_BACK.</Text>
      ) : views.map(({ jobRun, jobs }, index) => (
        <Box key={jobRun.id} flexDirection="column" marginTop={1}>
          <Text bold color={selected === index ? "cyan" : "white"}>
            {selected === index ? "❯" : " "} {jobRun.id} · {jobRun.status}
          </Text>
          <JobTable
            jobs={jobs}
            freezeRunningElapsed={!(resuming && selected === index)}
          />
        </Box>
      ))}
      <Help>
        {resuming
          ? "Melanjutkan job run..."
          : views.length === 0
            ? "Enter/Esc kembali ke menu"
            : "↑/↓ pilih · Enter lanjutkan · Esc kembali"}
      </Help>
    </Panel>
  );
}

function ResetDatabase({
  orchestrator,
  onBack,
  onError,
}: {
  orchestrator: DeploymentOrchestrator;
  onBack: () => void;
  onError: (error: unknown) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const reset = useCallback(() => {
    if (resetting) return;
    setResetting(true);
    void orchestrator.resetDatabase()
      .then(() => setCompleted(true))
      .catch(onError)
      .finally(() => setResetting(false));
  }, [onError, orchestrator, resetting]);

  useInput((_input, key) => {
    if (completed && (key.return || key.escape)) onBack();
    if (completed || resetting) return;
    if (key.escape) onBack();
    if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
      setConfirmed((value) => !value);
    }
    if (key.return) confirmed ? reset() : onBack();
  });

  return (
    <Panel title="Reset database">
      {completed ? (
        <>
          <Text bold color="green">✓ Riwayat job run berhasil dihapus.</Text>
          <Text dimColor>Definisi job dan struktur database tetap tersedia.</Text>
          <Help>Enter/Esc kembali ke menu</Help>
        </>
      ) : resetting ? (
        <Text><Spinner /> Menghapus riwayat job run</Text>
      ) : (
        <>
          <Text color="yellow">Semua job run dan log akan dihapus permanen.</Text>
          <Text dimColor>Definisi job dan migrasi database tidak ikut dihapus.</Text>
          <Box marginTop={1}>
            <Text inverse={confirmed} color={confirmed ? "red" : "white"}> Reset </Text>
            <Text>  </Text>
            <Text inverse={!confirmed} color={!confirmed ? "green" : "white"}> Batal </Text>
          </Box>
          <Help>←/→ pilih · Enter konfirmasi · Esc kembali</Help>
        </>
      )}
    </Panel>
  );
}

function ResultView({
  result,
  elapsedMilliseconds,
  onMenu,
  onExit,
}: {
  result: JobRunResult;
  elapsedMilliseconds: number;
  onMenu: () => void;
  onExit: () => void;
}) {
  useInput((input, key) => {
    if (input === "q" || key.escape) onExit();
    if (key.return || input === "m") onMenu();
  });
  return (
    <Panel title="Selesai">
      <Text bold color={result.jobRun.status === "SUCCESS" ? "green" : "red"}>
        {result.jobRun.status === "SUCCESS"
          ? "✓ Job run berhasil"
          : "✗ Job run tidak berhasil"}
      </Text>
      <SummaryRow label="Job run" value={result.jobRun.id} />
      <SummaryRow label="Status" value={result.jobRun.status} />
      <SummaryRow label="Total waktu" value={formatElapsedSeconds(elapsedMilliseconds)} />
      <JobTable jobs={result.jobs} />
      <Help>Enter/m kembali ke menu · q/Esc keluar</Help>
    </Panel>
  );
}

function ExitMessage({
  message,
  onMenu,
  onExit,
}: {
  message: string;
  onMenu: () => void;
  onExit: () => void;
}) {
  useInput((input, key) => {
    if (input === "q" || key.escape) onExit();
    if (key.return || input === "m") onMenu();
  });
  return (
    <Panel title="Terjadi kesalahan">
      <Text bold color="red">{message}</Text>
      <Text>State SQLite tetap tersedia untuk diperiksa.</Text>
      <Help>Enter/m kembali ke menu · q/Esc keluar</Help>
    </Panel>
  );
}

function JobTable({
  jobs,
  freezeRunningElapsed = false,
}: {
  jobs: JobStepRunRecord[];
  freezeRunningElapsed?: boolean;
}) {
  if (jobs.length === 0) return <Text dimColor>Menyiapkan job...</Text>;
  return (
    <Box flexDirection="column" marginTop={1}>
      {jobs.map((job) => {
        const appearance = jobStatusAppearance(job.status);
        const attempt = job.attempt > 0
          ? `attempt ${job.attempt}/${job.maxRetries + 1}`
          : "belum dijalankan";
        return (
          <Box key={job.jobId} flexDirection="column">
            <Box>
              <Text color={appearance.color}>{appearance.symbol} </Text>
              <Box width={18}><Text>{job.jobId}</Text></Box>
              <Box width={19}><Text color={appearance.color}>{job.status}</Text></Box>
              <Box width={24}><Text dimColor>{attempt}</Text></Box>
              <Text dimColor>
                {formatJobTiming(
                  job,
                  freezeRunningElapsed ? Date.parse(job.updatedAt) : Date.now(),
                )}
              </Text>
            </Box>
            {job.error !== null && <Text color="red">   {job.error}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}

function Spinner() {
  const frames = ["◐", "◓", "◑", "◒"];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => value + 1), 100);
    return () => clearInterval(timer);
  }, []);
  return <Text color="cyan">{frames[frame % frames.length]}</Text>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" marginTop={1}>{children}</Box>
    </Box>
  );
}

function MenuRow({
  selected,
  label,
  detail,
}: {
  selected: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <Box>
      <Text color={selected ? "cyan" : "white"}>{selected ? "❯" : " "} </Text>
      <Text bold={selected} inverse={selected}> {label} </Text>
      {detail !== undefined && <Text dimColor>  {detail}</Text>}
    </Box>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Box width={19}><Text dimColor>{label}</Text></Box>
      <Text>{value}</Text>
    </Box>
  );
}

function caseInputString(deploymentCase: CloudDeploymentCase, key: string): string {
  const input = deploymentCase.steps.vm?.input;
  if (input === null || typeof input !== "object" || Array.isArray(input)) return "-";
  const value = input[key];
  return typeof value === "string" ? value : "-";
}

function Help({ children }: { children: React.ReactNode }) {
  return <Box marginTop={1}><Text dimColor>{children}</Text></Box>;
}

export function jobStatusAppearance(status: JobStatus): { symbol: string; color: string } {
  if (status === "SUCCESS") return { symbol: "✓", color: "green" };
  if (status === "FAILED" || status === "ROLLBACK_FAILED") return { symbol: "✗", color: "red" };
  if (status === "ROLLED_BACK") return { symbol: "↩", color: "yellow" };
  if (status === "ROLLBACK_SKIPPED") return { symbol: "○", color: "yellow" };
  if (status === "SKIPPED") return { symbol: "–", color: "yellow" };
  if (status === "PENDING") return { symbol: "○", color: "gray" };
  return { symbol: "●", color: "cyan" };
}

export function formatElapsedSeconds(elapsedMilliseconds: number): string {
  return `${(Math.round(elapsedMilliseconds / 10) / 100).toFixed(2)} detik`;
}

export function formatJobElapsed(
  job: Pick<JobStepRunRecord, "startedAt" | "finishedAt">,
  currentTimeMilliseconds: number = Date.now(),
): string {
  if (job.startedAt === null) return "-";
  const startedAt = Date.parse(job.startedAt);
  const finishedAt = job.finishedAt === null
    ? currentTimeMilliseconds
    : Date.parse(job.finishedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return "-";
  return formatElapsedSeconds(Math.max(0, finishedAt - startedAt));
}

export function formatJobTiming(
  job: Pick<JobStepRunRecord,
    | "attempt"
    | "status"
    | "startedAt"
    | "executionDurationMs"
    | "rollbackStartedAt"
    | "rollbackDurationMs"
  >,
  currentTimeMilliseconds: number = Date.now(),
): string {
  if (job.attempt === 0) return "-";

  let executionDuration = job.executionDurationMs;
  if (job.status === "RUNNING" && job.startedAt !== null) {
    executionDuration += elapsedSince(job.startedAt, currentTimeMilliseconds);
  }
  let timing = `eksekusi ${formatElapsedSeconds(executionDuration)}`;

  if (job.status === "ROLLBACK_SKIPPED") return `${timing} · rollback dilewati`;
  if (job.rollbackStartedAt === null) return timing;

  let rollbackDuration = job.rollbackDurationMs;
  if (job.status === "ROLLING_BACK") {
    rollbackDuration += elapsedSince(job.rollbackStartedAt, currentTimeMilliseconds);
  }
  timing += ` · rollback ${formatElapsedSeconds(rollbackDuration)}`;
  return timing;
}

function elapsedSince(timestamp: string, currentTimeMilliseconds: number): number {
  const startedAt = Date.parse(timestamp);
  if (!Number.isFinite(startedAt) || !Number.isFinite(currentTimeMilliseconds)) return 0;
  return Math.max(0, currentTimeMilliseconds - startedAt);
}

function wrapIndex(index: number, length: number): number {
  return length === 0 ? 0 : (index + length) % length;
}

function caseIdFromFilename(filename: string): string {
  return basename(filename, ".json").replace(/^\d+[._-]/, "");
}

function caseIndex(filename: string): number {
  const match = /^(\d+)[._-]/.exec(filename);
  return match === null ? Number.MAX_SAFE_INTEGER : Number(match[1]);
}

function caseDescription(id: string, deploymentCase: CloudDeploymentCase): string {
  return typeof deploymentCase.description === "string" && deploymentCase.description.trim() !== ""
    ? deploymentCase.description
    : id;
}

function isInteractiveExitResult(value: unknown): value is InteractiveExitResult {
  if (value === null || typeof value !== "object") return false;
  return typeof (value as { exitCode?: unknown }).exitCode === "number";
}

function isMainModule(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
