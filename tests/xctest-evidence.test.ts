import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPassedXCTest, assertPerformanceBudget, assertQualityTestSource, validateXCTestMetadata } from "../extensions/pi-ios/verification/xctest-evidence.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const tests = { testNodes: [{ nodeType: "Test Suite", name: "Suite", children: [{ nodeType: "Test Case", name: "QualityTests.testAccessibility", nodeIdentifier: "QualityTests/testAccessibility()", result: "Passed" }, { nodeType: "Test Case", name: "QualityTests.testLaunch", nodeIdentifier: "QualityTests/testLaunch()", result: "Passed" }] }] };
const metrics = [{ testIdentifier: "QualityTests/testLaunch()", testRuns: [{ metrics: [{ displayName: "Application Launch", identifier: "com.apple.XCTApplicationLaunchMetric", measurements: [0.8, 0.9] }] }] }];

describe("XCTest-backed quality evidence", () => {
  it("requires audit API and XCTest identifiers instead of self-attested metadata", () => {
    assert.throws(() => validateXCTestMetadata("accessibility", { testIdentifier: "QualityTests.testAccessibility", auditAPI: "manual", auditIssues: 0 }), /auditAPI/);
    assert.throws(() => validateXCTestMetadata("performance", { testIdentifier: "QualityTests.testLaunch" }), /metric name/);
    validateXCTestMetadata("accessibility", { testIdentifier: "QualityTests.testAccessibility", auditAPI: "XCUIApplication.performAccessibilityAudit", auditIssues: 0 });
    validateXCTestMetadata("performance", { testIdentifier: "QualityTests.testLaunch", metric: "Application Launch" });
  });

  it("accepts only passed named tests and project-budgeted measurements", () => {
    assertPassedXCTest(tests, "QualityTests.testAccessibility");
    assert.throws(() => assertPassedXCTest(tests, "QualityTests.missing"), /no passing XCTest/);
    assertPerformanceBudget(metrics, "QualityTests.testLaunch", "Application Launch", 1);
    assert.throws(() => assertPerformanceBudget(metrics, "QualityTests.testLaunch", "Application Launch", 0.85), /exceeded project budget/);
  });

  it("requires the named source test to contain the matching XCTest API", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-ios-xctest-evidence-")); roots.push(root);
    await writeFile(join(root, "QualityTests.swift"), "import XCTest\nfinal class QualityTests: XCTestCase { func testAccessibility() throws { try XCUIApplication().performAccessibilityAudit() }; func testLaunch() { measure(metrics: [XCTApplicationLaunchMetric()]) {} } }\n");
    await assertQualityTestSource(root, "accessibility", "QualityTests.testAccessibility");
    await assertQualityTestSource(root, "performance", "QualityTests.testLaunch");
    await assert.rejects(assertQualityTestSource(root, "accessibility", "QualityTests.testMissing"), /does not contain/);
  });
});
