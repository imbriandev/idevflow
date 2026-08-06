import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { iapReconciliationSummary, releaseReadinessSummary, testFlightCandidateForPreparation } from "../extensions/idevflow/tools/flow-tool.ts";
import type { ReleaseCandidate } from "../extensions/idevflow/release/service.ts";

const snapshot = { initialized: true, lifecycle: "promoted", revision: 1, route: "ship" as const, reason: "Create the explicit manual TestFlight handoff package.", baselineReady: true, activeWriter: false, activePipeline: false, workerRecommendation: { mode: "pipeline_unavailable" as const, reason: "", eligibleSliceIds: [] } };

describe("founder flow facade", () => {
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

  it("summarizes beta readiness without kernel tool choreography", () => {
    const text = releaseReadinessSummary(snapshot, null, { project: { container: "App.xcodeproj", scheme: "App" }, targets: [], identities: [], findings: [] }, { bundleId: "com.example.app", appFound: true, inAppPurchases: [], builds: [] });
    assert.match(text, /Beta readiness: Prepare TestFlight handoff/);
    assert.match(text, /Signing configuration looks ready/);
    assert.doesNotMatch(text, /idev_|session|receipt/i);
  });
});
