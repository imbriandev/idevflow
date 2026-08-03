import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Risk, Stage } from "../lifecycle/contracts.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export const KNOWLEDGE_SURFACES = ["product", "copy", "swiftui", "swiftdata", "concurrency", "testing", "accessibility", "performance", "privacy", "monetization", "release", "widgetkit", "app-intents", "audit"] as const;
export type KnowledgeSurface = (typeof KNOWLEDGE_SURFACES)[number];

export interface KnowledgeReference {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly stages: readonly Stage[];
  readonly surfaces: readonly KnowledgeSurface[];
  readonly estimatedTokens: number;
}

export const KNOWLEDGE_REFERENCES: readonly KnowledgeReference[] = [
  { id: "context-discipline", path: "references/context-discipline.md", title: "Context Discipline", stages: ["define", "plan", "build", "test", "review", "ship", "learn"], surfaces: [], estimatedTokens: 350 },
  { id: "product-interface", path: "references/product-interface.md", title: "Product and Interface Writing", stages: ["define", "plan", "build", "test", "review", "ship", "learn"], surfaces: ["product", "copy", "accessibility"], estimatedTokens: 750 },
  { id: "swiftui-experience", path: "references/swiftui-experience.md", title: "SwiftUI Experience", stages: ["plan", "build", "test", "review"], surfaces: ["swiftui", "accessibility", "performance", "widgetkit"], estimatedTokens: 1000 },
  { id: "swift-state", path: "references/swift-state.md", title: "SwiftData and Concurrency", stages: ["plan", "build", "test", "review", "ship"], surfaces: ["swiftdata", "concurrency", "privacy"], estimatedTokens: 950 },
  { id: "testing-quality", path: "references/testing-quality.md", title: "Testing and Quality Evidence", stages: ["build", "test", "review", "ship"], surfaces: ["testing", "accessibility", "performance"], estimatedTokens: 850 },
  { id: "privacy-security", path: "references/privacy-security.md", title: "Privacy and Security", stages: ["define", "plan", "build", "test", "review", "ship"], surfaces: ["privacy"], estimatedTokens: 650 },
  { id: "monetization", path: "references/monetization.md", title: "StoreKit and Monetization", stages: ["define", "plan", "build", "test", "review", "ship", "learn"], surfaces: ["monetization", "privacy", "release"], estimatedTokens: 700 },
  { id: "review-audit", path: "references/review-audit.md", title: "Review and Audit", stages: ["review", "ship", "build"], surfaces: ["audit", "swiftui", "swiftdata", "concurrency", "privacy", "accessibility", "performance"], estimatedTokens: 800 },
  { id: "release-testflight", path: "references/release-testflight.md", title: "Release and TestFlight", stages: ["ship", "learn"], surfaces: ["release", "privacy", "monetization", "accessibility", "performance"], estimatedTokens: 750 },
  { id: "macos-release", path: "references/macos-release.md", title: "macOS Release and Distribution", stages: ["ship", "review", "build", "test"], surfaces: ["release", "privacy"], estimatedTokens: 500 },
  { id: "native-integrations", path: "references/native-integrations.md", title: "App Intents, WidgetKit, and Existing Platforms", stages: ["plan", "build", "test", "review"], surfaces: ["app-intents", "widgetkit", "swiftui"], estimatedTokens: 550 },
];

const TERMS: Readonly<Record<KnowledgeSurface, readonly RegExp[]>> = {
  product: [/\bidea\b/i, /target user/i, /slc\b/i, /onboarding/i, /first.?run/i, /scope/i],
  copy: [/\bcopy\b/i, /wording/i, /text|label|alert|empty state|error message/i, /locali[sz]/i],
  swiftui: [/swiftui/i, /\bview\b/i, /navigation|sheet|toolbar|tab/i, /dynamic type/i],
  swiftdata: [/swiftdata/i, /\bmodelcontext\b/i, /persistence|migration|cloudkit|relationship/i],
  concurrency: [/concurrency/i, /\basync\b|\bawait\b|actor|sendable|task\b|stream/i],
  testing: [/\btest\b|xctest|swift testing|flak|regression/i],
  accessibility: [/accessib|voiceover|dynamic type|reduce motion|contrast/i],
  performance: [/performance|slow|hitch|launch time|profil/i],
  privacy: [/privacy|permission|sensitive|secret|keychain|entitlement|delete data/i],
  monetization: [/storekit|revenuecat|purchase|subscription|paywall|restore purchase|entitlement/i],
  release: [/testflight|release|ship|app store|signing|build number|notari[sz]|hardened runtime|sandbox|entitlement/i],
  widgetkit: [/widgetkit|widget/i],
  "app-intents": [/app intent|appintents|shortcut|spotlight/i],
  audit: [/\baudit\b|deep review|codebase review/i],
};

export function detectKnowledgeSurfaces(task: string, explicit: readonly KnowledgeSurface[] = []): KnowledgeSurface[] {
  const found = new Set<KnowledgeSurface>(explicit);
  for (const [surface, patterns] of Object.entries(TERMS) as [KnowledgeSurface, readonly RegExp[]][]) {
    if (patterns.some((pattern) => pattern.test(task))) found.add(surface);
  }
  return [...found];
}

export interface KnowledgeSelection {
  readonly stage: Stage;
  readonly risk: Risk;
  readonly surfaces: readonly KnowledgeSurface[];
  readonly references: readonly (KnowledgeReference & { readonly relativePath: string; readonly reason: string })[];
  readonly deferred: readonly string[];
  readonly estimatedTokens: number;
  readonly budgetTokens: number;
}

const STAGE_DEFAULTS: Readonly<Record<Stage, readonly string[]>> = {
  define: ["product-interface"], plan: ["swift-state"], build: ["swiftui-experience"], test: ["testing-quality"], review: ["review-audit"], ship: ["release-testflight"], learn: ["product-interface"],
};

/** Selects a bounded cold path; it never reads project files or changes kernel policy. */
export function selectKnowledge(input: { readonly stage: Stage; readonly risk: Risk; readonly task: string; readonly surfaces?: readonly KnowledgeSurface[] }): KnowledgeSelection {
  const surfaces = detectKnowledgeSurfaces(input.task, input.surfaces ?? []);
  const ids = new Set(STAGE_DEFAULTS[input.stage]);
  for (const reference of KNOWLEDGE_REFERENCES) if (reference.surfaces.some((surface) => surfaces.includes(surface))) ids.add(reference.id);
  if (input.risk === "high" || input.risk === "critical") ids.add("privacy-security");
  if (input.stage === "ship" || surfaces.includes("release")) ids.add("release-testflight");
  const budgetTokens = input.risk === "critical" || input.stage === "ship" ? 3_200 : 2_400;
  const defaults = STAGE_DEFAULTS[input.stage];
  const required = input.stage === "ship"
    ? ["release-testflight", "privacy-security", "testing-quality", ...(surfaces.includes("monetization") ? ["monetization"] : [])]
    : input.risk === "high" || input.risk === "critical" ? ["privacy-security"] : [];
  const ordered = KNOWLEDGE_REFERENCES.filter((reference) => ids.has(reference.id)).sort((a, b) => {
    const aRequired = required.indexOf(a.id); const bRequired = required.indexOf(b.id);
    if (aRequired !== -1 || bRequired !== -1) return (aRequired === -1 ? Number.MAX_SAFE_INTEGER : aRequired) - (bRequired === -1 ? Number.MAX_SAFE_INTEGER : bRequired);
    const aDefault = defaults.includes(a.id) ? 0 : 1; const bDefault = defaults.includes(b.id) ? 0 : 1;
    if (aDefault !== bDefault) return aDefault - bDefault;
    const aStage = a.stages.includes(input.stage) ? 0 : 1; const bStage = b.stages.includes(input.stage) ? 0 : 1;
    if (aStage !== bStage) return aStage - bStage;
    const aMatch = a.surfaces.filter((surface) => surfaces.includes(surface)).length; const bMatch = b.surfaces.filter((surface) => surfaces.includes(surface)).length;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return a.estimatedTokens - b.estimatedTokens || a.id.localeCompare(b.id);
  });
  const selected: (KnowledgeReference & { relativePath: string; reason: string })[] = [];
  let estimatedTokens = 0;
  for (const reference of ordered) {
    if (selected.length >= 4 || estimatedTokens + reference.estimatedTokens > budgetTokens) continue;
    const matched = reference.surfaces.filter((surface) => surfaces.includes(surface));
    selected.push({ ...reference, relativePath: reference.path, path: join(PACKAGE_ROOT, reference.path), reason: matched.length ? `matched: ${matched.join(", ")}` : `stage default for ${input.stage}` });
    estimatedTokens += reference.estimatedTokens;
  }
  return { stage: input.stage, risk: input.risk, surfaces, references: selected, deferred: ordered.filter((reference) => !selected.some((item) => item.id === reference.id)).map((reference) => join(PACKAGE_ROOT, reference.path)), estimatedTokens, budgetTokens };
}
