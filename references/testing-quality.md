# Testing and Quality Evidence

Load for bug repair, regression coverage, flaky behavior, UI quality, accessibility, and performance evidence.

## Test design

- Reproduce before changing code. A no-repro result is uncertainty, not a pass.
- Prefer Swift Testing for new unit/integration tests and XCTest for UI tests; preserve a project’s existing test style unless migration is requested.
- Test public behavior, not private implementation. Keep tests order-independent, parallel-safe, deterministic, and offline.
- Use fixtures, narrow dependency injection, controllable time/randomness, parameterization, and confirmations instead of sleeps or mutable globals.
- Each test has a meaningful expectation/precondition. Match exact errors where relevant and use an explicit known-issue mechanism rather than weakening assertions.
- Test cancellation, retries, reentrancy, empty/error states, dynamic values, localization expansion, and persistence boundaries when they are part of the changed behavior.

## Quality proof

A successful build is not product proof. For a primary flow or release profile:

1. exercise the source-bound flow on a leased simulator;
2. capture every configured screenshot variant;
3. run `XCUIApplication.performAccessibilityAudit()` where a UI audit is required and retain evidence;
4. collect launch/interaction metrics with project-owned budgets where performance is claimed or gated.

For release verification, accessibility metadata names a passing XCTest test containing `XCUIApplication.performAccessibilityAudit()` and `auditIssues=0`. Performance metadata names a passing XCTest metric test; Pi iOS parses fresh xcresult measurements and compares their maximum to `quality.performanceBudgets` in project config. Do not invent looser budgets or metadata to turn a missing measurement into a pass. Proof metadata, artifact hashes, source fingerprint, context receipt, and verification receipt must agree.

## Failure handling

Read the test summary and shortest relevant diagnostics first. Repair the root cause within authorized scope, then re-run all invalidated verification and review evidence. Never hide flakes by adding retries alone or delete a regression assertion to make a suite green.
