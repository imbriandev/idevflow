import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { SafetyKernelError } from "../state/errors.ts";
import { StreamingRedactor } from "./redaction.ts";

const ENV_ALLOWLIST = new Set([
  "PATH", "HOME", "TMPDIR", "DEVELOPER_DIR", "SDKROOT", "LANG", "LC_ALL", "NSUnbufferedIO",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY",
  "AZURE_OPENAI_API_KEY", "MISTRAL_API_KEY", "GROQ_API_KEY", "XAI_API_KEY",
  "IDEVFLOW_WORKER_PACKET", "IDEVFLOW_WORKER_PACKET_DIGEST", "IDEVFLOW_WORKER_CAPABILITY", "IDEVFLOW_WORKER_EXTENSION",
  "PI_SKIP_VERSION_CHECK", "PI_TELEMETRY", "PI_PROVIDER", "PI_MODEL",
]);
const OVERRIDE_ONLY_ENV = new Set([
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY",
  "AZURE_OPENAI_API_KEY", "MISTRAL_API_KEY", "GROQ_API_KEY", "XAI_API_KEY",
  "IDEVFLOW_WORKER_PACKET", "IDEVFLOW_WORKER_PACKET_DIGEST", "IDEVFLOW_WORKER_CAPABILITY", "IDEVFLOW_WORKER_EXTENSION",
]);
const TAIL_CHARACTERS = 50_000;

export interface ProcessSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly onSpawn?: (pid: number) => void | Promise<void>;
  readonly redactValues?: readonly string[];
}

export interface SupervisedProcessResult {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

function boundedTail(current: string, addition: string): string {
  const combined = current + addition;
  return combined.length <= TAIL_CHARACTERS ? combined : combined.slice(-TAIL_CHARACTERS);
}

function safeEnvironment(overrides: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ENV_ALLOWLIST) {
    const value = overrides[key] ?? (OVERRIDE_ONLY_ENV.has(key) ? undefined : process.env[key]);
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function killProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

export async function runSupervised(spec: ProcessSpec, abortSignal?: AbortSignal): Promise<SupervisedProcessResult> {
  await Promise.all([mkdir(dirname(spec.stdoutPath), { recursive: true }), mkdir(dirname(spec.stderrPath), { recursive: true })]);
  const stdoutFile = await open(spec.stdoutPath, "w", 0o600);
  const stderrFile = await open(spec.stderrPath, "w", 0o600);
  const stdoutRedactor = new StreamingRedactor(spec.redactValues);
  const stderrRedactor = new StreamingRedactor(spec.redactValues);
  let stdoutTail = "";
  let stderrTail = "";
  let stdoutWrites = Promise.resolve();
  let stderrWrites = Promise.resolve();
  let timedOut = false;
  let cancelled = false;
  const started = Date.now();

  try {
    const child = spawn(spec.executable, [...spec.args], {
      cwd: spec.cwd,
      env: safeEnvironment(spec.environment),
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (child.pid && spec.onSpawn) {
      try { await spec.onSpawn(child.pid); }
      catch (error) { killProcessGroup(child.pid, "SIGTERM"); throw error; }
    }

    const completion = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
      child.stdout.on("data", (chunk: Buffer) => {
        const value = stdoutRedactor.push(chunk.toString("utf8"));
        if (value) {
          stdoutTail = boundedTail(stdoutTail, value);
          stdoutWrites = stdoutWrites.then(async () => { await stdoutFile.write(value); });
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const value = stderrRedactor.push(chunk.toString("utf8"));
        if (value) {
          stderrTail = boundedTail(stderrTail, value);
          stderrWrites = stderrWrites.then(async () => { await stderrFile.write(value); });
        }
      });
    });

    let forceKillTimer: NodeJS.Timeout | undefined;
    const terminate = () => {
      killProcessGroup(child.pid, "SIGTERM");
      if (forceKillTimer) clearTimeout(forceKillTimer);
      forceKillTimer = setTimeout(() => killProcessGroup(child.pid, "SIGKILL"), 5_000);
      forceKillTimer.unref();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, spec.timeoutMs);
    const abort = () => {
      cancelled = true;
      terminate();
    };
    if (abortSignal?.aborted) abort();
    else abortSignal?.addEventListener("abort", abort, { once: true });

    let outcome: { code: number | null; signal: NodeJS.Signals | null };
    try {
      outcome = await completion;
    } finally {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      abortSignal?.removeEventListener("abort", abort);
    }

    await Promise.all([stdoutWrites, stderrWrites]);
    const stdoutRemainder = stdoutRedactor.flush();
    const stderrRemainder = stderrRedactor.flush();
    if (stdoutRemainder) stdoutTail = boundedTail(stdoutTail, stdoutRemainder), await stdoutFile.write(stdoutRemainder);
    if (stderrRemainder) stderrTail = boundedTail(stderrTail, stderrRemainder), await stderrFile.write(stderrRemainder);
    await Promise.all([stdoutFile.sync(), stderrFile.sync()]);
    return {
      executable: spec.executable,
      args: [...spec.args],
      cwd: spec.cwd,
      code: outcome.code,
      signal: outcome.signal,
      durationMs: Date.now() - started,
      timedOut,
      cancelled,
      stdoutTail,
      stderrTail,
      stdoutPath: spec.stdoutPath,
      stderrPath: spec.stderrPath,
    };
  } catch (error) {
    throw new SafetyKernelError(`Failed to run ${spec.executable}: ${(error as Error).message}`, { cause: error });
  } finally {
    await Promise.all([stdoutFile.close(), stderrFile.close()]);
  }
}
