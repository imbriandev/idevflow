import { existsSync } from "node:fs";
import { basename } from "node:path";
import { readWorkerPacket } from "./packets.ts";
import { runSupervised, type SupervisedProcessResult } from "../process/supervisor.ts";

export interface WorkerLaunchInput {
  readonly packetPath: string;
  readonly packetDigest: string;
  readonly capability: string;
  readonly extensionPath: string;
  readonly cwd: string;
  readonly model?: string;
  readonly thinkingLevel?: string;
  readonly timeoutMs: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly signal?: AbortSignal;
  readonly onSpawn: (pid: number) => void | Promise<void>;
}

export interface WorkerLauncher {
  launch(input: WorkerLaunchInput): Promise<SupervisedProcessResult>;
}

function piInvocation(args: string[]): { executable: string; args: string[] } {
  const currentScript = process.argv[1];
  const bunVirtual = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !bunVirtual && existsSync(currentScript)) return { executable: process.execPath, args: [currentScript, ...args] };
  const runtime = basename(process.execPath).toLowerCase();
  if (!/^(?:node|bun)(?:\.exe)?$/.test(runtime)) return { executable: process.execPath, args };
  return { executable: "pi", args };
}

function credentialEnvironment(): Record<string, string> {
  const keys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "AZURE_OPENAI_API_KEY", "MISTRAL_API_KEY", "GROQ_API_KEY", "XAI_API_KEY"];
  return Object.fromEntries(keys.flatMap((key) => process.env[key] ? [[key, process.env[key]!]] : []));
}

function workerPrompt(packet: Awaited<ReturnType<typeof readWorkerPacket>>): string {
  return `You are an isolated iDevFlow pipeline worker. The deterministic packet below is your complete authority.\n\n${JSON.stringify(packet, null, 2)}\n\nRequired procedure:\n1. Call idev_preflight with stage=build, write=true, the exact task/risk/claims from the packet.\n2. Call idev_context with the packet stage/risk/task before loading specialist references; read only selected references relevant to the claimed surface. Inspect only the writer worktree and implement only this slice.\n3. Review acceptance, correctness, privacy, accessibility, and regressions while the writer session is still active. If repair is needed, call idev_pipeline_worker repair before each repair cycle; stop when denied.\n4. Run idev_verify at least at the packet verification profile after the final repair; use matrix=true when the packet names multiple platforms.\n5. Run idev_session postflight and finish. Do not modify source afterward.\n6. Run a fresh integration verification on the ready commit.\n7. Submit the source-bound machine-readable passing verdict with idev_pipeline_worker submit.\n\nNever integrate, promote, push, upload, distribute, alter the work graph, expand claims, or treat prose as a receipt. If blocked, call idev_pipeline_worker block with concise evidence.`;
}

export class PiWorkerLauncher implements WorkerLauncher {
  constructor(private readonly resolveInvocation: (args: string[]) => { executable: string; args: string[] } = piInvocation) {}

  async launch(input: WorkerLaunchInput): Promise<SupervisedProcessResult> {
    const packet = await readWorkerPacket(input.packetPath, input.packetDigest);
    const args = [
      "--mode", "json", "-p", "--no-session", "--approve",
      "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files",
      "-e", input.extensionPath,
      "--tools", "read,write,edit,idev_context,idev_preflight,idev_session,idev_verify,idev_exec,idev_pipeline_worker",
    ];
    if (input.model) args.push("--model", input.model);
    if (input.thinkingLevel) args.push("--thinking", input.thinkingLevel);
    args.push(workerPrompt(packet));
    const invocation = this.resolveInvocation(args);
    const credentials = credentialEnvironment();
    return runSupervised({
      executable: invocation.executable,
      args: invocation.args,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      stdoutPath: input.stdoutPath,
      stderrPath: input.stderrPath,
      environment: {
        ...credentials,
        IDEVFLOW_WORKER_PACKET: input.packetPath,
        IDEVFLOW_WORKER_PACKET_DIGEST: input.packetDigest,
        IDEVFLOW_WORKER_CAPABILITY: input.capability,
        IDEVFLOW_WORKER_EXTENSION: input.extensionPath,
        PI_SKIP_VERSION_CHECK: "1",
        PI_TELEMETRY: "0",
      },
      onSpawn: input.onSpawn,
      redactValues: [input.capability, ...Object.values(credentials)],
    }, input.signal);
  }
}
