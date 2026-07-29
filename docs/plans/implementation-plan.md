# Implementation Plan

## Completion standard

The rewrite is complete only when it can take a real trusted iOS repository through define, plan approval, isolated build, test, review, combined verification, ship approval, and TestFlight handoff without invoking AppForge's Python runtime.

## Milestone 1 — Specification freeze

- Inventory reference commands, services, data models, policies, and failure modes.
- Define typed stage contracts and lifecycle transitions.
- Record security invariants and release boundaries.
- Build and maintain the parity matrix.

Exit: every reference capability is classified as required, redesigned, intentionally omitted, or deferred with rationale.

## Milestone 2 — Package foundation

- Pi package manifest and TypeScript checks.
- Seven lifecycle commands and `/ios` dashboard command.
- Seven valid Agent Skills.
- Session mirror and status UI.
- Configuration schema and discovery contract.

Exit: package installs locally, reloads, exposes resources, and passes automated tests.

## Milestone 3 — Safety kernel

- Event journal, snapshot, cross-process lock, and migrations.
- Repository identity and baseline checks.
- Worktree/session lifecycle, path claims, leases, and heartbeat.
- Write/edit/bash interception and command policy.
- Preflight, postflight, status, doctor, and crash recovery.

Exit: adversarial tests cannot write outside authorization or lose unintegrated work.

## Milestone 4 — Xcode verification ✅ Complete

- Project/workspace/scheme/destination discovery.
- Cancellable process supervision with timeouts and redaction.
- Simulator leases and managed resource isolation.
- Verification profiles and adaptive policy.
- xcresult, screenshot, accessibility, and performance evidence.
- Fingerprinted receipts and artifact retention.

Exit: fixture apps and a real sample app produce commit-bound evidence.

## Milestone 5 — Full lifecycle ✅ Complete

- Product memory and SLC documents.
- Architecture plans and machine-readable work graphs.
- Build/test/review stage receipts.
- Privacy, monetization, and release gates.
- Candidate creation, ship approval, promotion, and handoff.

Exit: one single-agent golden path succeeds end to end.

## Milestone 6 — Multi-agent pipeline ✅ Complete

- Worker task packets and isolated Pi processes.
- Dependency scheduler and bounded concurrency.
- Review verdict schema and repair budgets.
- Integration epochs, candidate snapshot checks, and batch splitting.
- Reconciliation across worker crash and extension reload.

Exit: independent slices run concurrently and integrate without authority leakage.

## Milestone 7 — Production hardening ✅ Complete

- Fault injection and recovery tests.
- Behavioral workflow evaluations with mock agents.
- macOS/Xcode CI and simulator end-to-end suite.
- TUI interaction tests and non-interactive fail-closed tests.
- Installation, migration, diagnostics, versioning, and release documentation.

Exit: all quality gates pass and a real app reaches verified TestFlight handoff.

## Milestone 8 — Cutover

- Run the full parity matrix.
- Run the workflow on a real app.
- Confirm no Python invocation or AppForge runtime dependency.
- Tag the first stable package release.
