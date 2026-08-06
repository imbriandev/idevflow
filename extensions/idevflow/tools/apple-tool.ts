import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { appStorePricePoints, appStorePricing, appStoreStatus, archiveAppleApp, auditAppleSigning, deleteAppStorePrice, exportAndUploadTestFlight, installAutomicVaultBridge, provisionAppleDevice, setAppStorePrice, writeArchiveReceipt, type AppStorePriceScope } from "../apple/service.ts";
import { loadConfig } from "../config/config.ts";
import { integrationHead } from "../git/integration.ts";
import { loadCandidate } from "../release/service.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SafetyKernelError } from "../state/errors.ts";

const execFileAsync = promisify(execFile);

function priceScope(params: { priceScope?: "app" | "iap"; productId?: string }): AppStorePriceScope {
  const scope = params.priceScope ?? "app";
  if (scope === "iap" && !params.productId) throw new SafetyKernelError("IAP pricing requires productId");
  return scope;
}

export function priceDate(value: string | undefined, name: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || Number.isNaN(Date.parse(value))) throw new SafetyKernelError(`${name} must be an ISO-8601 UTC instant, for example 2026-01-15T00:00:00Z`);
  return value;
}

async function cleanAtCommit(root: string, commit: string): Promise<boolean> {
  const [head, status] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }),
    execFileAsync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }),
  ]);
  return head.stdout.trim() === commit && !status.stdout;
}

export function registerAppleTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "idev_apple",
    label: "iDevFlow Apple Developer",
    description: "Inspect App Store Connect, manage explicitly confirmed app or IAP price schedules, inspect iOS signing, provision a device, archive, configure a stable Automic Vault bridge, or upload an explicitly approved exact IPA to internal TestFlight.",
    promptSnippet: "Diagnose Apple signing and create explicitly approved local provisioning or archive evidence",
    promptGuidelines: [
      "Use app_store_status, pricing_status, or price_points to inspect App Store Connect state; they are read-only.",
      "set_price and delete_price require a trusted project and one confirmation for the exact app/IAP, Apple price-point or manual-price ID, and effective date. They never change availability, metadata, testers, or distribution.",
      "Use audit first for TestFlight signing or provisioning failures.",
      "provision_device, archive, and upload_testflight require trusted-project interactive founder confirmation.",
      "upload_testflight reads APP_CONNECT_KEY, APPSTORE_KEY_ID, and APPSTORE_ISSUER_ID only through an approved Automic Vault wrapper; never put credentials in tool arguments, source, or chat.",
      "upload_testflight never selects testers or distributes a build.",
    ],
    parameters: Type.Object({
      action: StringEnum(["app_store_status", "pricing_status", "price_points", "set_price", "delete_price", "audit", "provision_device", "archive", "setup_vault", "upload_testflight"] as const),
      deviceId: Type.Optional(Type.String()),
      priceScope: Type.Optional(StringEnum(["app", "iap"] as const)),
      productId: Type.Optional(Type.String()),
      territory: Type.Optional(Type.String()),
      pricePointId: Type.Optional(Type.String()),
      manualPriceId: Type.Optional(Type.String()),
      startDate: Type.Optional(Type.String()),
      endDate: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const config = await loadConfig(repository.primaryRoot);
      if (params.action === "app_store_status") {
        const status = await appStoreStatus(repository.primaryRoot, config);
        const text = status.appFound
          ? `App Store Connect: ${status.bundleId}; ${status.inAppPurchases.length} IAP(s), ${status.builds.length} build(s).`
          : `App Store Connect has no app record for ${status.bundleId}.`;
        return { content: [{ type: "text", text }], details: { status } };
      }
      if (params.action === "pricing_status") {
        const pricing = await appStorePricing(repository.primaryRoot, config, priceScope(params), params.productId);
        return { content: [{ type: "text", text: `App Store Connect pricing: ${pricing.manualPrices.length} manual ${pricing.scope} price(s).` }], details: { pricing } };
      }
      if (params.action === "price_points") {
        const territory = params.territory?.toUpperCase();
        if (!territory || !/^[A-Z]{3}$/.test(territory)) throw new SafetyKernelError("price_points requires a three-letter App Store Connect territory code, for example USA or VNM");
        const pricePoints = await appStorePricePoints(repository.primaryRoot, config, priceScope(params), territory, params.productId);
        return { content: [{ type: "text", text: `App Store Connect price points loaded for ${territory}.` }], details: { pricePoints } };
      }
      if (params.action === "audit") {
        const audit = await auditAppleSigning(repository.primaryRoot, config);
        const text = [
          `Signing audit: ${audit.project.container} / ${audit.project.scheme}${audit.project.bundleId ? ` (${audit.project.bundleId})` : ""}.`,
          ...audit.targets.map((target) => `${target.target}: team=${target.teamId ?? "missing"}, identity=${target.identity ?? "missing"}, profile=${target.profile ?? "automatic"}.`),
          ...(audit.findings.length ? ["Findings:", ...audit.findings.map((finding) => `- ${finding}`)] : ["No signing configuration issue detected."]),
        ].join("\n");
        return { content: [{ type: "text", text }], details: { audit } };
      }
      if (!ctx.isProjectTrusted() || !ctx.hasUI) throw new SafetyKernelError("Apple pricing, setup, provisioning, archive, and upload actions require a trusted project with interactive founder confirmation");
      if (params.action === "set_price") {
        const scope = priceScope(params);
        if (!params.pricePointId) throw new SafetyKernelError("set_price requires pricePointId from price_points");
        const startDate = priceDate(params.startDate, "startDate");
        const endDate = params.endDate ? priceDate(params.endDate, "endDate") : undefined;
        if (endDate && endDate <= startDate) throw new SafetyKernelError("endDate must be after startDate");
        const subject = scope === "app" ? "this app" : `IAP ${params.productId}`;
        const approved = await ctx.ui.confirm("Set App Store Connect price?", `Set ${subject} to Apple price point ${params.pricePointId} from ${startDate}${endDate ? ` until ${endDate}` : " with no end date"}. This changes only its price schedule; it does not change availability, metadata, testers, or distribution.`);
        if (!approved) return { content: [{ type: "text", text: "App Store Connect price change cancelled." }], details: { changed: false } };
        const pricing = await setAppStorePrice(repository.primaryRoot, config, scope, params.pricePointId, startDate, endDate, params.productId);
        return { content: [{ type: "text", text: "App Store Connect price schedule updated." }], details: { changed: true, pricing } };
      }
      if (params.action === "delete_price") {
        const scope = priceScope(params);
        if (!params.manualPriceId) throw new SafetyKernelError("delete_price requires manualPriceId from pricing_status");
        const subject = scope === "app" ? "this app" : `IAP ${params.productId}`;
        const approved = await ctx.ui.confirm("Remove App Store Connect manual price?", `Remove manual price ${params.manualPriceId} from ${subject}. Apple will replace the manual-price schedule while retaining its other current entries, then fall back to a remaining scheduled or automatic price. This does not delete the app/IAP or change availability, metadata, testers, or distribution.`);
        if (!approved) return { content: [{ type: "text", text: "App Store Connect price removal cancelled." }], details: { changed: false } };
        const pricing = await deleteAppStorePrice(repository.primaryRoot, config, scope, params.manualPriceId, params.productId);
        return { content: [{ type: "text", text: "App Store Connect manual price removed." }], details: { changed: true, pricing } };
      }

      if (params.action === "setup_vault") {
        const approved = await ctx.ui.confirm("Install stable Automic Vault bridge?", "It is installed once under your user config, independent of project/package paths. You will approve this exact bridge in Automic Vault before it can receive secrets.");
        if (!approved) return { content: [{ type: "text", text: "Automic Vault bridge setup cancelled." }], details: { configured: false } };
        const path = await installAutomicVaultBridge();
        return { content: [{ type: "text", text: `Automic Vault bridge installed at ${path}. Run av bless on this exact path once before TestFlight upload.` }], details: { configured: true, path } };
      }
      if (params.action === "provision_device") {
        if (!params.deviceId) throw new SafetyKernelError("provision_device requires deviceId");
        const approved = await ctx.ui.confirm("Provision this iPhone for development?", `Xcode may register ${params.deviceId} and create or update development profiles for the configured team. No archive, upload, or tester distribution will occur.`);
        if (!approved) return { content: [{ type: "text", text: "Apple device provisioning cancelled." }], details: { provisioned: false } };
        await provisionAppleDevice(repository.primaryRoot, config, params.deviceId);
        return { content: [{ type: "text", text: `Development provisioning succeeded for ${params.deviceId}. No archive, upload, or distribution occurred.` }], details: { provisioned: true, deviceId: params.deviceId } };
      }
      const candidate = await loadCandidate(repository);
      if (!candidate || candidate.status !== "promoted") throw new SafetyKernelError("Apple release requires an exact promoted TestFlight candidate; create, approve, and promote it first");
      if (params.action === "upload_testflight") {
        const approved = await ctx.ui.confirm("Upload exact build to internal TestFlight?", `Upload ${candidate.releaseManifest.bundleId} ${candidate.releaseManifest.version} (${candidate.releaseManifest.build}) from promoted commit ${candidate.commit}. This does not select testers or distribute the build.`);
        if (!approved) return { content: [{ type: "text", text: "TestFlight upload cancelled." }], details: { uploaded: false } };
        const uploaded = await exportAndUploadTestFlight(repository.primaryRoot, candidate);
        return { content: [{ type: "text", text: `Uploaded exact IPA to TestFlight; Apple processing was awaited. Receipt: ${uploaded.path}. No tester selection or distribution occurred.` }], details: { uploaded: true, receipt: uploaded.receipt, receiptPath: uploaded.path, distributed: false } };
      }
      if (await integrationHead(repository, config) !== candidate.commit) throw new SafetyKernelError("Archive blocked: integration no longer matches the promoted candidate");
      if (!(await cleanAtCommit(repository.primaryRoot, candidate.commit))) throw new SafetyKernelError("Archive requires the primary worktree to be clean at the exact promoted candidate commit");
      const approved = await ctx.ui.confirm("Archive exact TestFlight candidate?", `Xcode may update signing profiles and create a local signed archive for ${candidate.releaseManifest.bundleId} ${candidate.releaseManifest.version} (${candidate.releaseManifest.build}). It will not upload or distribute.`);
      if (!approved) return { content: [{ type: "text", text: "Apple archive cancelled." }], details: { archived: false } };
      const archive = await archiveAppleApp(repository.primaryRoot, config, candidate.id);
      const audit = await auditAppleSigning(repository.primaryRoot, config);
      const saved = await writeArchiveReceipt(repository.primaryRoot, candidate, archive.archivePath, archive.signing, audit.findings);
      return { content: [{ type: "text", text: `Signed archive created at ${archive.archivePath}; receipt ${saved.path} is ${saved.receipt.verdict}. Export, upload, and distribution were not performed.` }], details: { archived: true, archivePath: archive.archivePath, receipt: saved.receipt, receiptPath: saved.path, candidateFingerprint: candidate.fingerprint, uploaded: false, distributed: false } };
    },
  });
}
