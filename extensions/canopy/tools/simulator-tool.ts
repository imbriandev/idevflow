import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../config/config.ts";
import { discoverRepository } from "../repository/discovery.ts";
import { SessionRegistry } from "../sessions/registry.ts";
import { acquireSimulatorLease, captureSimulatorScreenshot, releaseSimulatorLease } from "../simulator/service.ts";
import { SimulatorLeaseStore } from "../simulator/leases.ts";
import { SafetyKernelError } from "../state/errors.ts";
import { sourceFingerprint } from "../verification/fingerprint.ts";

export function registerSimulatorTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "canopy_simulator",
    label: "Canopy Simulator",
    description: "Inspect, acquire, boot, or release the exclusive simulator lease for the current Canopy writer session.",
    parameters: Type.Object({
      action: StringEnum(["status", "acquire", "boot", "screenshot", "release"] as const),
      variant: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const repository = await discoverRepository(ctx.cwd);
      const session = await new SessionRegistry(repository).findLatestByPiSession(ctx.sessionManager.getSessionId());
      if (!session) throw new SafetyKernelError("Simulator operations require a Canopy writer session");
      const config = await loadConfig(repository.primaryRoot);
      if (params.action === "release") {
        const lease = await releaseSimulatorLease(repository, config, session.id);
        return { content: [{ type: "text", text: lease ? `Released ${lease.name} (${lease.udid}).` : "No simulator lease to release." }], details: { lease } };
      }
      if (params.action === "status") {
        const state = await new SimulatorLeaseStore(repository).load();
        const lease = Object.values(state.leases).find((item) => item.sessionId === session.id);
        return { content: [{ type: "text", text: lease ? `${lease.name} (${lease.udid}) leased until ${lease.expiresAt}.` : "No simulator lease." }], details: { lease, revision: state.revision } };
      }
      if (params.action === "screenshot") {
        const source = await sourceFingerprint(session);
        const captured = await captureSimulatorScreenshot(repository, config, session.id, params.variant ?? "", source.fingerprint);
        return { content: [{ type: "text", text: `Captured ${params.variant} screenshot at ${captured.path}; metadata ${captured.metadataPath}.` }], details: captured };
      }
      const lease = await acquireSimulatorLease(repository, config, session.id, params.action === "boot");
      return { content: [{ type: "text", text: `${params.action === "boot" ? "Booted" : "Leased"} ${lease.name} (${lease.udid}) on iOS ${lease.runtimeVersion}.` }], details: { lease } };
    },
  });
}
