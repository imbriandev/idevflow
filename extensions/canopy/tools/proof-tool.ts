import { realpath, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { discoverRepository } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { sourceFingerprint } from "../verification/fingerprint.ts";

function isWithin(root: string, path: string): boolean {
  const value = relative(root, path);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

const MetricSchema = Type.Object({
  name: Type.String(),
  value: Type.Number(),
  budget: Type.Number(),
});

export function registerProofTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "canopy_proof",
    label: "Canopy Proof",
    description: "Prepare source-local XCTest accessibility or performance proof metadata; release verification independently validates the named fresh xcresult evidence and project budget.",
    parameters: Type.Object({
      kind: StringEnum(["accessibility", "performance"] as const),
      artifactPath: Type.String(),
      tests: Type.Optional(Type.Array(Type.String())),
      metrics: Type.Optional(Type.Array(MetricSchema)),
      testIdentifier: Type.String(),
      metric: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (!session) throw new SafetyKernelError("Proof preparation requires a writer session");
      const artifactPath = isAbsolute(params.artifactPath) ? params.artifactPath : resolve(session.worktreePath, params.artifactPath);
      const canonical = await realpath(artifactPath);
      const worktree = await realpath(session.worktreePath);
      const runtime = await realpath(join(repository.primaryRoot, ".canopy"));
      if (!isWithin(worktree, canonical) && !isWithin(runtime, canonical)) throw new SafetyKernelError("Proof artifact escapes the worktree and local runtime");

      const source = await sourceFingerprint(session);
      let metadata: Readonly<Record<string, unknown>>;
      if (params.kind === "accessibility") {
        if (!params.tests?.length || params.tests.some((test) => !test.trim())) throw new SafetyKernelError("Accessibility proof requires non-empty test identifiers");
        metadata = { passed: true, tests: params.tests, testIdentifier: params.testIdentifier, auditAPI: "XCUIApplication.performAccessibilityAudit", auditIssues: 0, sourceFingerprint: source.fingerprint, recordedAt: new Date().toISOString() };
      } else {
        if (!params.metrics?.length || !params.metric?.trim()) throw new SafetyKernelError("Performance proof requires metrics and an XCTest metric name");
        const passed = params.metrics.every((metric) => Number.isFinite(metric.value) && Number.isFinite(metric.budget) && metric.value <= metric.budget);
        metadata = {
          passed,
          testIdentifier: params.testIdentifier,
          metric: params.metric.trim(),
          sourceFingerprint: source.fingerprint,
          metrics: Object.fromEntries(params.metrics.map((metric) => [metric.name, metric.value])),
          budgets: Object.fromEntries(params.metrics.map((metric) => [metric.name, metric.budget])),
          recordedAt: new Date().toISOString(),
        };
      }
      const directory = join(repository.primaryRoot, ".canopy", "evidence", session.id);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const metadataPath = join(directory, `${params.kind}.metadata.json`);
      await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      return {
        content: [{ type: "text", text: `Prepared ${params.kind} proof metadata at ${metadataPath}${metadata.passed === false ? " (budget failed)" : ""}.` }],
        details: { kind: params.kind, path: canonical, metadataPath, metadata },
      };
    },
  });
}
