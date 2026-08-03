# Milestone 10 — Context and XCTest Evidence Enforcement

## Outcome

High-risk specialist reasoning and release-quality claims are no longer accepted as unbound model prose or self-attested metadata. iDevFlow records the selected cold path as a session-bound receipt and validates release accessibility/performance evidence from fresh XCTest xcresult output.

## Context receipt gate

`idev_context` still selects a bounded package-owned cold path, but when invoked against an active, ready, or integrated writer session it atomically records:

- session id, requested lifecycle stage, risk, and task;
- selected reference ids and relative package paths;
- detected surfaces and selection fingerprint;
- timestamp and receipt id.

High/critical verification requires a receipt matching the writer session and risk. High/critical review requires a `review` receipt bound to the verified session. Release verification requires a separate `ship` receipt at `critical` risk. The selection fingerprint is part of the verification fingerprint and receipt, preventing evidence reuse across a different specialist context.

Selection before preflight remains useful for reasoning, but cannot satisfy a later high-risk gate until it is recorded against the actual session. Worker processes receive the selector and may read only canonical package Markdown references through a symlink-safe read exception.

## XCTest quality gate

Schema v5 adds project-owned quality policy:

```json
{
  "quality": {
    "requireXCTestEvidence": true,
    "performanceBudgets": {
      "Duration (AppLaunch)": 10
    }
  }
}
```

For a release profile with this policy enabled, iDevFlow requires:

1. source-bound screenshots and simulator provenance;
2. accessibility proof metadata naming a passing XCTest test whose source contains `XCUIApplication.performAccessibilityAudit()` and reports zero audit issues;
3. performance proof metadata naming a passing XCTest metric test and metric name;
4. fresh release xcresult `tests` output showing each named test passed;
5. fresh release xcresult `metrics` output with finite measurements whose maximum does not exceed the project-owned configured budget.

The engine persists parsed test/metrics summaries as hashed artifacts. Candidate creation independently requires the named XCTest metadata plus both parsed quality summaries. Agent-provided `metrics`/`budgets` metadata is descriptive only; it cannot relax the configured threshold.

## Proof

- Context-receipt tests prove high-risk verification fails before toolchain work without a receipt and release requires a distinct critical ship receipt.
- XCTest parser tests prove named pass, required API source, finite measurements, and budget enforcement.
- Config migration tests cover schema 4 → 5 quality defaults.
- The real SampleApp fixture uses a UI-testing target with a real `performAccessibilityAudit()` test and `XCTApplicationLaunchMetric` test.
- The full real SampleApp handoff E2E passes release verification only after parsing its fresh xcresult `Duration (AppLaunch)` measurements against the tracked project config budget.

## Boundary

The gate verifies local XCTest/Xcode evidence. It does not claim universal accessibility coverage, device-lab performance, App Store Connect state, or external tester distribution; those remain explicit future/manual boundaries.
