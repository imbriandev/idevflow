import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SafetyKernelError } from "../state/errors.ts";

export type XCTestEvidenceKind = "accessibility" | "performance";

function testToken(identifier: string): string {
  const token = identifier.split(/[./]/).filter(Boolean).at(-1);
  if (!token) throw new SafetyKernelError("XCTest evidence requires a non-empty testIdentifier");
  return token;
}

export function validateXCTestMetadata(kind: XCTestEvidenceKind, metadata: Readonly<Record<string, unknown>>): void {
  if (typeof metadata.testIdentifier !== "string" || !metadata.testIdentifier.trim()) throw new SafetyKernelError(`${kind} proof requires an XCTest testIdentifier`);
  if (kind === "accessibility") {
    if (metadata.auditAPI !== "XCUIApplication.performAccessibilityAudit" || metadata.auditIssues !== 0) {
      throw new SafetyKernelError("Accessibility proof requires auditAPI=XCUIApplication.performAccessibilityAudit and auditIssues=0");
    }
  } else if (typeof metadata.metric !== "string" || !metadata.metric.trim()) {
    throw new SafetyKernelError("Performance proof requires an XCTest metric name");
  }
}

interface TestNode { readonly name?: unknown; readonly nodeIdentifier?: unknown; readonly result?: unknown; readonly children?: unknown; }
function nodes(value: unknown): TestNode[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as { testNodes?: unknown; children?: unknown };
  const children = Array.isArray(raw.testNodes) ? raw.testNodes : Array.isArray(raw.children) ? raw.children : [];
  return children.flatMap((item) => [item as TestNode, ...nodes(item)]);
}

export function assertPassedXCTest(value: unknown, identifier: string): void {
  const token = testToken(identifier);
  const matched = nodes(value).filter((node) => `${String(node.name ?? "")} ${String(node.nodeIdentifier ?? "")}`.includes(token));
  if (!matched.some((node) => node.result === "Passed")) throw new SafetyKernelError(`xcresult has no passing XCTest matching ${identifier}`);
}

interface Metric { readonly displayName?: unknown; readonly identifier?: unknown; readonly measurements?: unknown; }
function metrics(value: unknown): Array<{ testIdentifier: string; metric: Metric }> {
  if (Array.isArray(value)) return value.flatMap(metrics);
  if (!value || typeof value !== "object") return [];
  const raw = value as { testIdentifier?: unknown; testRuns?: unknown };
  const identifier = typeof raw.testIdentifier === "string" ? raw.testIdentifier : undefined;
  const direct = identifier && Array.isArray(raw.testRuns)
    ? raw.testRuns.flatMap((run) => run && typeof run === "object" && Array.isArray((run as { metrics?: unknown }).metrics) ? (run as { metrics: Metric[] }).metrics.map((metric) => ({ testIdentifier: identifier, metric })) : [])
    : [];
  return [...direct, ...Object.values(value).flatMap((child) => metrics(child))];
}

export function assertPerformanceBudget(value: unknown, identifier: string, metricName: string, budget: number): void {
  const token = testToken(identifier);
  const match = metrics(value).find(({ testIdentifier, metric }) => testIdentifier.includes(token) && (metric.displayName === metricName || metric.identifier === metricName));
  if (!match || !Array.isArray(match.metric.measurements) || !match.metric.measurements.length || match.metric.measurements.some((measurement) => typeof measurement !== "number" || !Number.isFinite(measurement))) {
    const available = metrics(value).map((entry) => `${entry.testIdentifier}:${String(entry.metric.displayName ?? entry.metric.identifier ?? "unknown")}`).join(", ");
    throw new SafetyKernelError(`xcresult has no finite ${metricName} measurements for ${identifier}; available: ${available || "none"}`);
  }
  const maximum = Math.max(...match.metric.measurements as number[]);
  if (maximum > budget) throw new SafetyKernelError(`XCTest metric ${metricName} exceeded project budget ${budget}: ${maximum}`);
}

async function swiftFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if ([".git", ".canopy", "DerivedData", "node_modules"].includes(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await swiftFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".swift")) files.push(path);
  }
  return files;
}

/** Confirms the passed XCTest is backed by a source test containing the relevant API. */
export async function assertQualityTestSource(root: string, kind: XCTestEvidenceKind, identifier: string): Promise<void> {
  const token = testToken(identifier);
  const sources = await Promise.all((await swiftFiles(root)).map(async (path) => ({ path, content: await readFile(path, "utf8") })));
  const api = kind === "accessibility" ? /performAccessibilityAudit\s*\(/ : /\bmeasure\s*\(|XCT(?:ApplicationLaunch|OSSignpost|Clock)Metric/;
  if (!sources.some((source) => source.content.includes(token) && api.test(source.content))) {
    throw new SafetyKernelError(`${kind} proof test ${identifier} does not contain required XCTest API evidence`);
  }
}
