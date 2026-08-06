import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { iapReconciliationSummary, iosBootstrapFiles, releaseReadinessSummary, selectFlowContinuationSession, testFlightCandidateForPreparation } from "../extensions/idevflow/tools/flow-tool.ts";
import type { WriterSession } from "../extensions/idevflow/sessions/types.ts";
import type { ReleaseCandidate } from "../extensions/idevflow/release/service.ts";

const snapshot = { initialized: true, lifecycle: "promoted", revision: 1, route: "ship" as const, reason: "Archive, export, and upload the exact approved internal beta.", baselineReady: true, activeWriter: false };

describe("founder flow facade", () => {
  it("generates one minimal testable iOS app spec and rejects unsafe identifiers", () => {
    const files = iosBootstrapFiles({ appName: "FocusApp", bundleId: "com.example.focus" });
    assert.match(files["project.yml"]!, /FocusAppTests/);
    assert.match(files["FocusApp/FocusApp.swift"]!, /@main/);
    assert.match(files["FocusAppTests/FocusAppTests.swift"]!, /@testable import FocusApp/);
    assert.throws(() => iosBootstrapFiles({ appName: "Focus App", bundleId: "com.example.focus" }));
    assert.throws(() => iosBootstrapFiles({ appName: "FocusApp", bundleId: "not-a-bundle-id" }));
  });

  it("reports the exact missing catalog IAP without inventing a commercial change", () => {
    const text = iapReconciliationSummary({ products: [{ productID: "annual", type: "auto-renewable-subscription", referenceName: "Annual" }, { productID: "lifetime", type: "non-consumable", referenceName: "Lifetime" }] }, { bundleId: "com.example.app", appFound: true, inAppPurchases: [{ productId: "lifetime", state: "MISSING_METADATA" }], builds: [] });
    assert.match(text, /Missing: annual/);
    assert.match(text, /Needs App Store metadata: lifetime/);
  });

  it("accepts only a ready internal TestFlight candidate for the one-step upload", () => {
    const candidate = { status: "ready", target: "testflight-internal" } as ReleaseCandidate;
    assert.equal(testFlightCandidateForPreparation(candidate), candidate);
    assert.throws(() => testFlightCandidateForPreparation({ ...candidate, target: "testflight-external" }));
  });

  it("continues the current Pi session before an otherwise unique completed run", () => {
    const own = { id: "own", piSessionId: "founder", status: "ready_for_integration" } as WriterSession;
    const other = { id: "other", piSessionId: "other", status: "ready_for_integration" } as WriterSession;
    assert.equal(selectFlowContinuationSession([own, other], "founder"), own);
    assert.equal(selectFlowContinuationSession([other], "founder"), other);
    assert.equal(selectFlowContinuationSession([own, other], "third-session"), undefined);
  });

  it("summarizes beta readiness without kernel tool choreography", () => {
    const text = releaseReadinessSummary(snapshot, null, { project: { container: "App.xcodeproj", scheme: "App" }, targets: [], identities: [], findings: [] }, { bundleId: "com.example.app", appFound: true, inAppPurchases: [], builds: [] });
    assert.match(text, /Beta readiness: Prepare TestFlight beta/);
    assert.match(text, /Signing configuration looks ready/);
    assert.doesNotMatch(text, /idev_|session|receipt/i);
  });
});
