import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { appStoreStatus, archiveAppleApp, auditAppleSigning, exportAndUploadTestFlight, type AppStoreStatus, type SigningAudit, writeArchiveReceipt } from "../apple/service.ts";
import { initializeConfig, loadConfig } from "../config/config.ts";
import { founderStatus, inspectCoordinator, type CoordinatorSnapshot } from "../coordinator/service.ts";
import { issuePromotionApproval, loadCandidate, promoteCandidate, type ReleaseCandidate } from "../release/service.ts";
import { approvePlan, definitionAcceptance, integrateCurrentStage, startMaintenance, startTestRepair } from "../lifecycle/service.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import type { WriterSession } from "../sessions/types.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { RuntimeStore } from "../state/runtime-store.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { hasExistingAppleProject } from "../recovery/existing-project.ts";

interface IapCatalog { readonly products: readonly { readonly productID: string; readonly type: string; readonly referenceName: string }[]; }

export async function loadIapCatalog(root: string, path = "docs/store/iap-products.json"): Promise<IapCatalog> {
  const absolute = resolve(root, path);
  if (relative(root, absolute).startsWith(`..${sep}`)) throw new SafetyKernelError("IAP catalog must stay inside the project");
  let raw: unknown;
  try { raw = JSON.parse(await readFile(absolute, "utf8")); } catch (error) { throw new SafetyKernelError(`Cannot read IAP catalog at ${path}`, { cause: error }); }
  const products = (raw as { products?: unknown }).products;
  if (!Array.isArray(products) || !products.length) throw new SafetyKernelError("IAP catalog requires products");
  const normalized = products.map((item) => {
    const product = item as { productID?: unknown; type?: unknown; referenceName?: unknown };
    if (typeof product.productID !== "string" || !product.productID || typeof product.type !== "string" || !product.type || typeof product.referenceName !== "string" || !product.referenceName) throw new SafetyKernelError("Each IAP catalog product requires productID, type, and referenceName");
    return { productID: product.productID, type: product.type, referenceName: product.referenceName };
  });
  return { products: normalized };
}

export function iapReconciliationSummary(catalog: IapCatalog, store: AppStoreStatus): string {
  const actual = new Set(store.inAppPurchases.map((product) => product.productId));
  const missing = catalog.products.filter((product) => !actual.has(product.productID));
  const lines = [`IAP reconciliation: ${catalog.products.length - missing.length}/${catalog.products.length} catalog product(s) exist in App Store Connect.`];
  if (missing.length) lines.push(`Missing: ${missing.map((product) => product.productID).join(", ")}.`);
  const incomplete = store.inAppPurchases.filter((product) => product.state && product.state !== "READY_TO_SUBMIT");
  if (incomplete.length) lines.push(`Needs App Store metadata: ${incomplete.map((product) => product.productId).join(", ")}.`);
  if (!missing.length && !incomplete.length) lines.push("Catalog matches the current App Store Connect product list.");
  return lines.join("\n");
}

export function testFlightCandidateForPreparation(candidate: ReleaseCandidate | null): ReleaseCandidate {
  if (!candidate || (candidate.status !== "ready" && candidate.status !== "promoted") || candidate.target !== "testflight-internal") throw new SafetyKernelError("Internal TestFlight preparation requires one ready or promoted internal TestFlight candidate");
  return candidate;
}

export function selectFlowContinuationSession(sessions: readonly WriterSession[], piSessionId: string): WriterSession | undefined {
  const ready = sessions.filter((session) => session.status === "ready_for_integration");
  return ready.find((session) => session.piSessionId === piSessionId) ?? (ready.length === 1 ? ready[0] : undefined);
}

export interface IosBootstrap {
  readonly appName: string;
  readonly bundleId: string;
}

export function iosBootstrapFiles(input: IosBootstrap): Readonly<Record<string, string>> {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(input.appName)) throw new SafetyKernelError("App name must contain only letters and numbers and start with a letter");
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(input.bundleId)) throw new SafetyKernelError("Bundle ID must be reverse-DNS text such as com.example.app");
  const name = input.appName;
  return {
    "project.yml": `name: ${name}
options:
  deploymentTarget:
    iOS: "17.0"
targets:
  ${name}:
    type: application
    platform: iOS
    sources:
      - path: ${name}
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: ${input.bundleId}
        MARKETING_VERSION: "1.0"
        CURRENT_PROJECT_VERSION: "1"
        SWIFT_VERSION: "6.0"
        GENERATE_INFOPLIST_FILE: YES
        INFOPLIST_KEY_UILaunchScreen_Generation: YES
    scheme:
      testTargets:
        - ${name}Tests
  ${name}Tests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - path: ${name}Tests
    dependencies:
      - target: ${name}
`,
    [`${name}/${name}.swift`]: `import SwiftUI

@main
struct ${name}App: App {
  var body: some Scene { WindowGroup { ContentView() } }
}

struct ContentView: View {
  var body: some View { Text("${name}") }
}
`,
    [`${name}Tests/${name}Tests.swift`]: `import XCTest
@testable import ${name}

final class ${name}Tests: XCTestCase {
  func testAppTargetLoads() { XCTAssertTrue(true) }
}
`,
    [`${name}/PrivacyInfo.xcprivacy`]: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>NSPrivacyTracking</key><false/><key>NSPrivacyCollectedDataTypes</key><array/><key>NSPrivacyAccessedAPITypes</key><array/></dict></plist>
`,
  };
}

export function releaseReadinessSummary(
  snapshot: CoordinatorSnapshot,
  candidate: ReleaseCandidate | null,
  signing: SigningAudit,
  store?: AppStoreStatus,
): string {
  const lines = [`Beta readiness: ${founderStatus(snapshot).stage}.`];
  if (signing.findings.length) lines.push(`Signing needs attention: ${signing.findings.join(" ")}`);
  else lines.push("Signing configuration looks ready.");
  if (store) lines.push(store.appFound ? `App Store Connect: ${store.inAppPurchases.length} IAP(s), ${store.builds.length} build(s).` : `App Store Connect has no app record for ${store.bundleId}.`);
  if (candidate) lines.push(`Release candidate: ${candidate.status} for ${candidate.releaseManifest.version} (${candidate.releaseManifest.build}).`);
  lines.push(`Next: ${founderStatus(snapshot).blocked}`);
  return lines.join("\n");
}

export function registerFlowTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "idev_flow",
    label: "iDevFlow",
    description: "Founder-facing iDevFlow status and beta-readiness entry point. It hides routine workflow mechanics.",
    promptSnippet: "Give the founder a plain-language iDevFlow status or beta-readiness answer",
    promptGuidelines: [
      "Prefer idev_flow over combining runtime, doctor, signing, and App Store status calls for a founder-facing answer.",
      "Do not expose internal tool names, session IDs, receipts, or lifecycle mechanics unless the founder requests technical detail.",
      "Use bootstrap_ios only for a new clean Git repository; it creates and verifies one minimal iOS shell before the normal idea lifecycle.",
      "Use continue to integrate a unique completed plan, build, test, or learning session; definition acceptance remains a founder decision.",
      "Use approve_plan only after the founder has reviewed and accepted the exact plan.",
      "Use prepare_testflight only after the founder explicitly asks to upload the exact internal beta; it performs the eligible local promotion, archive, and upload sequence without selecting testers.",
      "Use reconcile_iap before proposing any App Store product mutation; do not invent commercial price or availability data.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "bootstrap_ios", "continue", "approve_plan", "start_maintenance", "start_test_repair", "beta_readiness", "reconcile_iap", "prepare_testflight"] as const),
      reason: Type.Optional(Type.String()),
      appName: Type.Optional(Type.String()),
      bundleId: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const snapshot = await inspectCoordinator(repository, ctx.sessionManager.getSessionId());
      if (params.action === "status") {
        const founder = founderStatus(snapshot);
        return { content: [{ type: "text", text: `${founder.stage}. ${founder.meaning}\nNext: ${founder.blocked}` }], details: { snapshot, founder } };
      }
      if (params.action === "bootstrap_ios") {
        if (!ctx.isProjectTrusted() || !ctx.hasUI) throw new SafetyKernelError("iOS bootstrap requires a trusted project and founder confirmation");
        if (repository.clean !== true || await hasExistingAppleProject(repository.primaryRoot)) throw new SafetyKernelError("iOS bootstrap requires a clean Git repository with no existing Apple project");
        const runtime = new RuntimeStore(repository);
        const lifecycle = (await runtime.status())?.lifecycle;
        if (lifecycle && lifecycle !== "idea") throw new SafetyKernelError("iOS bootstrap is available only before the first product definition");
        const files = iosBootstrapFiles({ appName: params.appName?.trim() ?? "", bundleId: params.bundleId?.trim() ?? "" });
        const appName = params.appName!.trim();
        const email = await pi.exec("git", ["config", "--get", "user.email"], { cwd: repository.primaryRoot });
        if (email.code !== 0 || !email.stdout.trim()) throw new SafetyKernelError("Configure Git user.email before bootstrapping an app");
        const approved = await ctx.ui.confirm("Create this iOS app shell?", `iDevFlow will generate ${appName} with XcodeGen, build it for the iOS Simulator, and commit the verified scaffold. It will not sign, archive, upload, or distribute.`);
        if (!approved) return { content: [{ type: "text", text: "iOS bootstrap cancelled." }], details: { bootstrapped: false } };
        const paths = ["project.yml", appName, `${appName}Tests`, `${appName}.xcodeproj`];
        let committed = false;
        try {
          for (const [path, content] of Object.entries(files)) {
            await mkdir(join(repository.primaryRoot, path, ".."), { recursive: true });
            await writeFile(join(repository.primaryRoot, path), content, "utf8");
          }
          const generated = await pi.exec("xcodegen", ["generate", "--spec", "project.yml"], { cwd: repository.primaryRoot });
          if (generated.code !== 0) throw new SafetyKernelError(`XcodeGen failed: ${generated.stderr || generated.stdout}`);
          const build = await pi.exec("xcodebuild", ["-project", `${appName}.xcodeproj`, "-scheme", appName, "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator", "build"], { cwd: repository.primaryRoot, timeout: 1_800_000 });
          if (build.code !== 0) throw new SafetyKernelError(`iOS scaffold build failed: ${build.stderr || build.stdout}`);
          const added = await pi.exec("git", ["add", "--", ...paths], { cwd: repository.primaryRoot });
          if (added.code !== 0) throw new SafetyKernelError(`Cannot stage iOS scaffold: ${added.stderr || added.stdout}`);
          const commitResult = await pi.exec("git", ["commit", "--no-gpg-sign", "-m", `chore: bootstrap ${appName} iOS app`], { cwd: repository.primaryRoot });
          if (commitResult.code !== 0) throw new SafetyKernelError(`Cannot commit iOS scaffold: ${commitResult.stderr || commitResult.stdout}`);
          committed = true;
          if (!(await runtime.status())) await runtime.initialize("bootstrap_ios");
          await initializeConfig(repository.primaryRoot);
          return { content: [{ type: "text", text: `${appName} was generated, built for the iOS Simulator, and committed. Define the first user outcome next.` }], details: { bootstrapped: true, appName, bundleId: params.bundleId!.trim() } };
        } catch (error) {
          if (!committed) {
            await rm(join(repository.primaryRoot, "project.yml"), { force: true });
            await Promise.all(paths.slice(1).map((path) => rm(join(repository.primaryRoot, path), { recursive: true, force: true })));
          }
          throw error;
        }
      }
      if (params.action === "approve_plan") {
        if (!ctx.isProjectTrusted() || !ctx.hasUI) throw new SafetyKernelError("Plan approval requires a trusted project and founder confirmation");
        const approved = await ctx.ui.confirm("Approve this implementation plan?", "Pi may implement, build, test, and review only the exact approved plan. You will separately approve the TestFlight upload.");
        if (!approved) return { content: [{ type: "text", text: "Plan approval cancelled." }], details: { approved: false } };
        const approval = await approvePlan(repository, "founder");
        return { content: [{ type: "text", text: "Plan approved. Implementation can begin." }], details: { approved: true, approval } };
      }
      if (params.action === "continue") {
        if (!ctx.isProjectTrusted()) throw new SafetyKernelError("Founder delivery actions require a trusted project");
        const session = selectFlowContinuationSession(Object.values((await new SessionRegistry(repository).load()).sessions), ctx.sessionManager.getSessionId());
        if (!session) throw new SafetyKernelError("No unique completed work is ready to continue; choose the completed work first.");
        let acceptedAssumptions: readonly string[] = [];
        let acceptedCritique = false;
        if (session.stage === "define") {
          if (!ctx.hasUI) throw new SafetyKernelError("Definition acceptance requires a trusted project and founder confirmation");
          const acceptance = await definitionAcceptance(repository, session);
          acceptedCritique = await ctx.ui.confirm(acceptance.prompt.title, acceptance.prompt.message);
          if (!acceptedCritique) return { content: [{ type: "text", text: "Definition acceptance cancelled." }], details: { integrated: false } };
          acceptedAssumptions = acceptance.unresolvedCriticalAssumptionIds;
        }
        const receipt = await integrateCurrentStage(repository, session, session.postflight?.evidence ?? "", undefined, acceptedAssumptions, acceptedCritique);
        return { content: [{ type: "text", text: `Completed ${receipt.stage} integrated. ${receipt.stage === "plan" ? "Review and approve the plan to begin implementation." : "Pi can continue the delivery run."}` }], details: { integrated: true, receipt } };
      }
      if (params.action === "start_maintenance" || params.action === "start_test_repair") {
        if (!ctx.isProjectTrusted()) throw new SafetyKernelError("Founder delivery actions require a trusted project");
        const reason = params.reason?.trim() ?? "";
        if (!reason) throw new SafetyKernelError(`${params.action === "start_maintenance" ? "Maintenance" : "Test repair"} requires the observed user-visible problem`);
        if (params.action === "start_maintenance") await startMaintenance(repository, ctx.sessionManager.getSessionId(), reason);
        else await startTestRepair(repository, ctx.sessionManager.getSessionId(), reason);
        return { content: [{ type: "text", text: `${params.action === "start_maintenance" ? "Maintenance" : "Test repair"} started. Pi can continue the delivery run.` }], details: { started: true } };
      }
      const config = await loadConfig(repository.primaryRoot);
      if (params.action === "reconcile_iap") {
        const store = await appStoreStatus(repository.primaryRoot, config);
        const catalog = await loadIapCatalog(repository.primaryRoot);
        return { content: [{ type: "text", text: iapReconciliationSummary(catalog, store) }], details: { catalog, store } };
      }
      if (params.action === "prepare_testflight") {
        if (!ctx.isProjectTrusted() || !ctx.hasUI) throw new SafetyKernelError("Internal TestFlight preparation requires a trusted project and founder confirmation");
        const candidate = testFlightCandidateForPreparation(await loadCandidate(repository));
        const approved = await ctx.ui.confirm("Upload this exact internal beta?", `iDevFlow will ${candidate.status === "ready" ? "promote it locally, " : ""}create a signed archive, export its IPA, and upload ${candidate.releaseManifest.version} (${candidate.releaseManifest.build}) to App Store Connect. It will not select testers or distribute the build.`);
        if (!approved) return { content: [{ type: "text", text: "Internal beta upload cancelled." }], details: { uploaded: false } };
        const promoted = candidate.status === "ready"
          ? await promoteCandidate(repository, (await issuePromotionApproval(repository, "founder")).token)
          : candidate;
        const archive = await archiveAppleApp(repository.primaryRoot, config, promoted.id);
        const signing = await auditAppleSigning(repository.primaryRoot, config);
        const saved = await writeArchiveReceipt(repository.primaryRoot, promoted, archive.archivePath, archive.signing, signing.findings);
        if (saved.receipt.verdict !== "ready_for_founder_upload_review") throw new SafetyKernelError("Archive signing needs attention; IPA upload did not start");
        const uploaded = await exportAndUploadTestFlight(repository.primaryRoot, promoted);
        return { content: [{ type: "text", text: `Internal beta ${promoted.releaseManifest.version} (${promoted.releaseManifest.build}) uploaded; Apple processing was awaited. No testers were selected.` }], details: { uploaded: true, candidate: promoted, archive: saved.receipt, receipt: uploaded.receipt, receiptPath: uploaded.path, distributed: false } };
      }
      const [candidate, signing, store] = await Promise.all([
        loadCandidate(repository),
        auditAppleSigning(repository.primaryRoot, config),
        appStoreStatus(repository.primaryRoot, config).catch(() => undefined),
      ]);
      return { content: [{ type: "text", text: releaseReadinessSummary(snapshot, candidate, signing, store) }], details: { snapshot, candidate, signing, store } };
    },
  });
}
