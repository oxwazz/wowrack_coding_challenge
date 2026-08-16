#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Box, render, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { FakeCloudStackClient } from "../../requests/client.js";
import { createDeploymentSteps } from "../../requests/deployment-steps.js";
import { CLI_DEFAULTS, cloudStackApiUrl } from "../../constants.js";
import { errorMessage } from "../../utils.js";
import {
  caseMaxTimeout,
  DeploymentOrchestrator,
} from "../../core/deployment-orchestrator.js";
import type {
  CloudDeploymentCase,
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
  | "reset"
  | "done"
  | "error";

/**
 * Reads and parses one deployment-case JSON file.
 *
 * @param filename - Absolute or relative path to the JSON file.
 * @returns The parsed deployment-case configuration.
 * @throws A contextual error when the file contains invalid JSON.
 *
 * @example
 * ```ts
 * const deploymentCase = await loadCloudDeploymentCase("cases/01.basic.json");
 * ```
 */
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

/**
 * Discovers JSON deployment cases and sorts them by numeric filename prefix.
 *
 * @param directory - Directory containing deployment-case JSON files.
 * @returns Menu metadata for each valid case file.
 *
 * @example
 * ```ts
 * const cases = await listCloudDeploymentCases("src/interfaces/cli/cases");
 * ```
 */
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
  // Numeric prefixes define menu order; filenames make ties deterministic.
  return cases.sort((left, right) =>
    left.index - right.index || left.filename.localeCompare(right.filename));
}

/** Renders the interactive CLI and resolves with the exit code chosen by the user. */
export async function runInteractiveCli(options: InteractiveCliOptions): Promise<number> {
  const cases = await listCloudDeploymentCases(options.casesDirectory);
  const instance = render(
    <App {...options} cases={cases} />,
    { alternateScreen: true, exitOnCtrlC: false, incrementalRendering: true },
  );
  const result = await instance.waitUntilExit();
  return isInteractiveExitResult(result) ? result.exitCode : 0;
}

/** Configures dependencies, launches the interactive CLI, and closes the database on exit. */
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
    deploymentSteps: createDeploymentSteps(client),
  });
  try {
    process.exitCode = await runInteractiveCli({
      orchestrator,
      casesDirectory,
      databasePath,
      endpoint,
    });
  } finally {
    await orchestrator.close();
  }
}

/** Coordinates the CLI screen state and routes user actions between workflow views. */
function App({
  orchestrator,
  casesDirectory,
  databasePath,
  endpoint,
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

  /** Displays an error screen and records a failing process exit code. */
  const showFailure = useCallback((error: unknown) => {
    setFailure(errorMessage(error));
    setLastExitCode(1);
    setScreen("error");
  }, []);

  /** Displays a completed run and derives the process exit code from its final status. */
  const showCompletion = useCallback((value: JobRunResult, elapsedMs: number) => {
    setResult(value);
    setElapsedMilliseconds(elapsedMs);
    setLastExitCode(value.jobRun.status === "SUCCESS" ? 0 : 1);
    setScreen("done");
  }, []);

  /** Clears prior workflow state and opens the deployment-case picker. */
  const startNewFlow = useCallback(() => {
    setDeploymentCase(undefined);
    setCaseSummary(undefined);
    setResult(undefined);
    setElapsedMilliseconds(undefined);
    setFailure("");
    setLastExitCode(0);
    setScreen("case");
  }, []);

  /** Loads the selected deployment case and advances to its confirmation screen. */
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

  /** Starts execution when a deployment case has been loaded successfully. */
  const start = useCallback(() => {
    if (deploymentCase !== undefined) setScreen("running");
  }, [deploymentCase]);

  return (
    <Box flexDirection="column">
      <Header />

      {screen === "menu" && (
        <MainMenu
          onNew={startNewFlow}
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

/** Renders the persistent CLI title and implementation summary. */
function Header() {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">Deployment Job Orchestrator</Text>
      <Text dimColor>Fake CloudStack API · persistent SQLite · DAG scheduler</Text>
    </Box>
  );
}

/** Renders and handles keyboard navigation for the top-level CLI menu. */
function MainMenu({
  onNew,
  onReset,
  onExit,
}: {
  onNew: () => void;
  onReset: () => void;
  onExit: () => void;
}) {
  const options = [
    "Mulai job run baru",
    "Reset database",
    "Keluar",
  ];
  const [selected, setSelected] = useState(0);
  useInput((input, key) => {
    if (key.upArrow) setSelected((value) => wrapIndex(value - 1, options.length));
    if (key.downArrow) setSelected((value) => wrapIndex(value + 1, options.length));
    if (input === "q") onExit();
    if (key.return) [onNew, onReset, onExit][selected]?.();
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

/** Renders and handles keyboard navigation for available deployment cases. */
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

/** Shows the selected case configuration and requests deployment confirmation. */
function Confirm({
  caseSummary,
  deploymentCase,
  databasePath,
  endpoint,
  onStart,
  onBack,
}: {
  caseSummary: CloudDeploymentCaseSummary;
  deploymentCase: CloudDeploymentCase;
  databasePath: string;
  endpoint: string;
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
        label="Max timeout"
        value={formatMaxTimeout(caseMaxTimeout(deploymentCase))}
      />
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

function formatMaxTimeout(maxTimeout: number | undefined): string {
  return maxTimeout === undefined ? "-" : `${maxTimeout} ms`;
}

/** Creates, executes, and periodically refreshes the live state of a new job run. */
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
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState(0);
  useEffect(() => {
    let mounted = true;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;
    const startedAt = performance.now();
    const elapsedTimer = setInterval(() => {
      if (mounted) setElapsedMilliseconds(performance.now() - startedAt);
    }, 100);
    // Keep the orchestration promise independent from React's synchronous effect callback.
    void (async () => {
      try {
        const maxTimeout = caseMaxTimeout(deploymentCase);
        const id = await orchestrator.createJobRunFromCase(deploymentCase);
        if (!mounted) return;
        setJobRunId(id);
        /** Refreshes the displayed step state from persistent storage. */
        const refresh = async () => {
          const current = await orchestrator.store.getJobStepRuns(id);
          if (mounted) setJobs(current);
        };
        await refresh();
        // SQLite is the source of truth, so the UI polls persisted state during execution.
        refreshTimer = setInterval(() => void refresh().catch(onError), 200);
        const result = await orchestrator.runJobRun(id, maxTimeout);
        if (!mounted) return;
        await refresh();
        onComplete(result, performance.now() - startedAt);
      } catch (error) {
        if (mounted) onError(error);
      } finally {
        if (refreshTimer !== undefined) clearInterval(refreshTimer);
        clearInterval(elapsedTimer);
      }
    })();
    return () => {
      // Prevent state updates after navigation unmounts the runner.
      mounted = false;
      if (refreshTimer !== undefined) clearInterval(refreshTimer);
      clearInterval(elapsedTimer);
    };
  }, [deploymentCase, onComplete, onError, orchestrator]);

  return (
    <Panel title="Job run berjalan">
      <Text><Spinner /> Menjalankan job</Text>
      {jobRunId !== "" && <Text dimColor>ID: {jobRunId}</Text>}
      <SummaryRow label="Total waktu" value={formatElapsedSeconds(elapsedMilliseconds)} />
      <JobTable jobs={jobs} />
      <Help>Status dibaca langsung dari SQLite setiap 200 ms.</Help>
    </Panel>
  );
}

/** Requests confirmation and clears persisted run history from the database. */
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

  /** Starts the database reset once and updates the view when it finishes. */
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

/** Displays a completed job run, its timing, and navigation choices. */
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

/** Displays a workflow error and offers menu or exit actions. */
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

/** Renders current job-step states, attempts, errors, and timing details. */
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
        const attempt = job.rollbackAttempt > 0
          ? `rollback ${job.rollbackAttempt}/${job.maxRollbackRetries + 1}`
          : job.attempt > 0
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

/** Renders a lightweight animated activity indicator. */
function Spinner() {
  const frames = ["◐", "◓", "◑", "◒"];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => value + 1), 100);
    return () => clearInterval(timer);
  }, []);
  return <Text color="cyan">{frames[frame % frames.length]}</Text>;
}

/** Provides consistent spacing and title presentation for a CLI screen. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" marginTop={1}>{children}</Box>
    </Box>
  );
}

/** Renders one selectable menu row with optional supporting detail. */
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

/** Renders a label and value pair using the summary layout. */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Box width={19}><Text dimColor>{label}</Text></Box>
      <Text>{value}</Text>
    </Box>
  );
}

/** Renders contextual keyboard instructions beneath a CLI view. */
function Help({ children }: { children: React.ReactNode }) {
  return <Box marginTop={1}><Text dimColor>{children}</Text></Box>;
}

/**
 * Maps a job status to the symbol and color used by the terminal UI.
 *
 * @param status - Persisted status of a job step.
 * @returns Ink-compatible symbol and color values.
 *
 * @example
 * ```ts
 * jobStatusAppearance("SUCCESS"); // { symbol: "✓", color: "green" }
 * ```
 */
export function jobStatusAppearance(status: JobStatus): { symbol: string; color: string } {
  if (status === "SUCCESS") return { symbol: "✓", color: "green" };
  if (status === "FAILED" || status === "ROLLBACK_FAILED") return { symbol: "✗", color: "red" };
  if (status === "ROLLED_BACK") return { symbol: "↩", color: "yellow" };
  if (status === "ROLLBACK_SKIPPED") return { symbol: "○", color: "yellow" };
  if (status === "SKIPPED") return { symbol: "–", color: "yellow" };
  if (status === "PENDING") return { symbol: "○", color: "gray" };
  return { symbol: "●", color: "cyan" };
}

/**
 * Formats a millisecond duration as seconds with two decimal places.
 *
 * @param elapsedMilliseconds - Duration to format.
 * @returns A localized CLI label such as `1.25 detik`.
 *
 * @example
 * ```ts
 * formatElapsedSeconds(1_250); // "1.25 detik"
 * ```
 */
export function formatElapsedSeconds(elapsedMilliseconds: number): string {
  return `${(Math.round(elapsedMilliseconds / 10) / 100).toFixed(2)} detik`;
}

/**
 * Calculates and formats elapsed execution time from persisted timestamps.
 * Running jobs use the supplied reference time; completed jobs use `finishedAt`.
 *
 * @param job - Job timestamps required for the calculation.
 * @param currentTimeMilliseconds - Reference clock used for an unfinished job.
 * @returns A formatted duration, or `-` when timing data is unavailable.
 */
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

/**
 * Formats execution and rollback durations for a reconstructed job-step state.
 *
 * @param job - Persisted status and accumulated timing fields.
 * @param currentTimeMilliseconds - Reference clock for an active phase.
 * @returns A combined execution and rollback timing label.
 *
 * @example
 * ```ts
 * const label = formatJobTiming(job, Date.now());
 * // "eksekusi 1.25 detik · rollback 0.50 detik"
 * ```
 */
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
    // Persisted duration covers finished attempts; add only the currently active attempt.
    executionDuration += elapsedSince(job.startedAt, currentTimeMilliseconds);
  }
  let timing = `eksekusi ${formatElapsedSeconds(executionDuration)}`;

  if (job.status === "ROLLBACK_SKIPPED") return `${timing} · rollback dilewati`;
  if (job.rollbackStartedAt === null) return timing;

  let rollbackDuration = job.rollbackDurationMs;
  if (job.status === "ROLLING_BACK") {
    // The active rollback phase has no finishing log yet, so calculate its live duration.
    rollbackDuration += elapsedSince(job.rollbackStartedAt, currentTimeMilliseconds);
  }
  timing += ` · rollback ${formatElapsedSeconds(rollbackDuration)}`;
  return timing;
}

/** Calculates a non-negative duration between an ISO timestamp and a reference time. */
function elapsedSince(timestamp: string, currentTimeMilliseconds: number): number {
  const startedAt = Date.parse(timestamp);
  if (!Number.isFinite(startedAt) || !Number.isFinite(currentTimeMilliseconds)) return 0;
  return Math.max(0, currentTimeMilliseconds - startedAt);
}

/** Wraps a selection index within a list and safely handles an empty list. */
function wrapIndex(index: number, length: number): number {
  return length === 0 ? 0 : (index + length) % length;
}

/** Derives a stable case identifier from its numbered JSON filename. */
function caseIdFromFilename(filename: string): string {
  return basename(filename, ".json").replace(/^\d+[._-]/, "");
}

/** Extracts the numeric ordering prefix from a deployment-case filename. */
function caseIndex(filename: string): number {
  const match = /^(\d+)[._-]/.exec(filename);
  // Unnumbered cases are still available but appear after explicitly ordered files.
  return match === null ? Number.MAX_SAFE_INTEGER : Number(match[1]);
}

/** Returns an explicit case description or falls back to its derived identifier. */
function caseDescription(id: string, deploymentCase: CloudDeploymentCase): string {
  return typeof deploymentCase.description === "string" && deploymentCase.description.trim() !== ""
    ? deploymentCase.description
    : id;
}

/** Narrows an Ink exit result to the CLI's expected exit-code payload. */
function isInteractiveExitResult(value: unknown): value is InteractiveExitResult {
  if (value === null || typeof value !== "object") return false;
  return typeof (value as { exitCode?: unknown }).exitCode === "number";
}

/** Determines whether this module is the process entry point rather than an import. */
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
