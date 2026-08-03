# Milestone 7 — Production Hardening

## Outcome

Canopy has repeatable local and macOS CI gates, adversarial recovery coverage, mock-agent authority evaluations, confirmation-gate tests, metadata-only diagnostics, and installation/release operating documentation. The package remains a self-contained TypeScript Pi extension.

## Fault containment and recovery

Hash-chained lifecycle, session, and pipeline journals are tested for partial-tail recovery and complete-record corruption. A partial final write is repaired only while holding the domain lock during a mutation. A complete malformed or hash-invalid record fails closed and cannot be overwritten by a later mutation.

Worker process timeout, cancellation, process-group termination, output redaction, stale writer repair, lost-worker reconciliation, integration batch splitting, candidate drift, and source preservation are covered by deterministic tests. Recovery never deletes an unintegrated branch, worktree, packet, log, or receipt.

## Agent and interaction evaluations

Mock-agent evaluations call the registered typed tools rather than simulate prose. They prove that a worker cannot invoke coordinator operations and that an untrusted agent cannot create a release candidate. Tool interaction tests prove that release and pipeline approvals fail closed when no UI exists, and that an interactive rejection returns a cancelled result before coordinator mutation.

## Diagnostics

`canopy_doctor report` creates a versioned structured support report with runtime revision, config migration state, aggregate writer/pipeline/candidate health, and sanitized diagnostic recommendations. It intentionally excludes source content, task text, packets, logs, approval tokens, verification receipts, and credentials. The report has a `ready` or `attention` health state and is returned as typed tool details rather than persisted by default.

`canopy_doctor status` remains human-readable. `repair` remains interactive and only marks expired active writer sessions stale. Pipeline loss remains reconciled through the coordinator; no diagnostic action deletes source.

## CI and release readiness

`.github/workflows/verify.yml` runs on macOS:

- Node 22 installation and the full typecheck/unit suite
- Pi extension loading and package dry-run
- whitespace validation
- real Xcode simulator verification and the full SampleApp manual-handoff E2E with `CANOPY_IOS_XCODE_E2E=1`

`docs/installation.md` documents requirements, local loading, initialization, safe migration, diagnostics, and exact validation commands. `docs/release-process.md` separates package release from iOS app promotion and reiterates the manual TestFlight boundary.

## Proof

The hardened suite includes:

- complete pipeline-journal corruption failure and partial-tail repair
- metadata-only diagnostic report secrecy
- non-interactive and cancellation confirmation gates
- worker/untrusted mock-agent authority evaluations
- existing writer/pipeline/release fault and recovery coverage
- macOS real Xcode E2E locally and in CI

Milestone exit criterion: satisfied when the full suite, package smoke checks, and real Xcode E2E pass on a supported macOS runner.
