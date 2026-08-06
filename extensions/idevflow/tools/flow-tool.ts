import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { appStoreStatus, archiveAppleApp, auditAppleSigning, exportAndUploadTestFlight, type AppStoreStatus, type SigningAudit, writeArchiveReceipt } from "../apple/service.ts";
import { loadConfig } from "../config/config.ts";
import { founderStatus, inspectCoordinator, type CoordinatorSnapshot } from "../coordinator/service.ts";
import { issuePromotionApproval, loadCandidate, promoteCandidate, type ReleaseCandidate } from "../release/service.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { discoverRepository } from "../repository/discovery.ts";

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
      "Use prepare_testflight only after the founder explicitly asks to upload the exact internal beta; it performs the eligible local promotion, archive, and upload sequence without selecting testers.",
      "Use reconcile_iap before proposing any App Store product mutation; do not invent commercial price or availability data.",
    ],
    parameters: Type.Object({ action: StringEnum(["status", "beta_readiness", "reconcile_iap", "prepare_testflight"] as const) }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const snapshot = await inspectCoordinator(repository, ctx.sessionManager.getSessionId());
      if (params.action === "status") {
        const founder = founderStatus(snapshot);
        return { content: [{ type: "text", text: `${founder.stage}. ${founder.meaning}\nNext: ${founder.blocked}` }], details: { snapshot, founder } };
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
