import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { runSupervised } from "../process/supervisor.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { sourceFingerprint } from "../verification/fingerprint.ts";

function within(root: string, path: string): boolean { const value = relative(root, path); return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value)); }
function invocation(args: string[]): { executable: string; args: string[] } {
  const script = process.argv[1];
  if (script && existsSync(script)) return { executable: process.execPath, args: [script, ...args] };
  return { executable: "pi", args };
}
export function parseVisualVerdict(output: string): Record<string, unknown> {
  const match = output.match(/\{[\s\S]*\}/);
  if (!match) throw new SafetyKernelError("Visual reviewer did not return JSON");
  const value = JSON.parse(match[0]) as Record<string, unknown>;
  if (!Array.isArray(value.findings) || typeof value.summary !== "string" || !["pass", "fix_required"].includes(String(value.verdict))) throw new SafetyKernelError("Visual reviewer returned an invalid verdict");
  return value;
}

export function registerVisualReviewTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "idev_visual_review", label: "iDevFlow Visual Review",
    description: "Run the active Pi model as an isolated, source-bound visual UI reviewer for a captured screenshot. It never edits source or passes a release gate by itself.",
    parameters: Type.Object({ artifactPath: Type.String(), focus: Type.String(), mode: StringEnum(["primary-flow", "polish"] as const) }),
    async execute(_id, params, signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (!session) throw new SafetyKernelError("Visual review requires an iDevFlow writer session");
      if (!ctx.hasUI) throw new SafetyKernelError("Visual AI review fails closed without interactive approval");
      const image = await realpath(isAbsolute(params.artifactPath) ? params.artifactPath : resolve(session.worktreePath, params.artifactPath));
      const runtime = await realpath(join(repository.primaryRoot, ".idevflow"));
      if (!within(session.worktreePath, image) && !within(runtime, image)) throw new SafetyKernelError("Visual review artifact escapes the worktree or iDevFlow runtime");
      if (!/\.png$/i.test(image)) throw new SafetyKernelError("Visual review requires a PNG screenshot");
      const provider = process.env.PI_PROVIDER;
      const model = process.env.PI_MODEL;
      if (!provider || !model) throw new SafetyKernelError("Visual review requires the active Pi provider and model");
      const approved = await ctx.ui.confirm("Run AI visual review?", `Send ${basename(image)} to the active Pi model (${provider}/${model}) for UI analysis. This may incur model cost.`);
      if (!approved) return { content: [{ type: "text", text: "Visual review cancelled." }], details: { reviewed: false } };
      const source = await sourceFingerprint(session);
      const directory = join(repository.primaryRoot, ".idevflow", "evidence", session.id, "visual-review");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const prompt = `You are an exacting Apple-platform UI/UX reviewer. Review only the attached screenshot for: hierarchy, primary action clarity, information density, spacing, typography, contrast, affordances, accessibility cues, and ${params.focus}. Do not claim behavior not visible. Return JSON only: {"verdict":"pass"|"fix_required","summary":"...","findings":[{"severity":"high"|"medium"|"low","area":"...","finding":"...","evidence":"visible detail","recommendation":"smallest fix"}],"unaudited":["..."]}. A ${params.mode} review must flag any visible primary-flow blocker.`;
      const child = invocation(["--mode", "text", "--no-session", "--no-tools", "--no-context-files", "--provider", provider, "--model", model, "-p", `@${image}`, prompt]);
      const result = await runSupervised({ executable: child.executable, args: child.args, cwd: session.worktreePath, timeoutMs: 120_000, stdoutPath: join(directory, "stdout.log"), stderrPath: join(directory, "stderr.log"), environment: { PI_PROVIDER: provider, PI_MODEL: model, PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" } }, signal);
      if (result.code !== 0 || result.timedOut || result.cancelled) throw new SafetyKernelError(`Visual reviewer failed: ${result.stderrTail || result.stdoutTail}`);
      const verdict = parseVisualVerdict(result.stdoutTail);
      const imageHash = createHash("sha256").update(await readFile(image)).digest("hex");
      const report = { schemaVersion: 1, sourceFingerprint: source.fingerprint, sourceCommit: source.commit, image, imageHash, provider, model, focus: params.focus, mode: params.mode, verdict, reviewedAt: new Date().toISOString() };
      const reportPath = join(directory, "report.json");
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
      return { content: [{ type: "text", text: `Visual review ${verdict.verdict} for ${basename(image)}; report ${reportPath}. It is advisory evidence, not a release pass.` }], details: { reviewed: true, report, reportPath } };
    },
  });
}
