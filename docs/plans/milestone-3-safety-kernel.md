# Milestone 3 — Safety Kernel Execution

## Goal

Make every future write, worker, verification result, and release decision depend on recoverable deterministic project state.

## Slice 3.1 — Durable state foundation

Status: Implemented

- Git common-directory discovery across linked worktrees.
- One primary runtime root for all worktrees.
- Append-only JSONL event journal.
- SHA-256 event hash chain and monotonic revisions.
- Optimistic revision checks.
- Atomic snapshot replacement with fsync boundaries.
- Cross-process directory lock with owner token and conservative stale recovery.
- Incomplete final-record recovery under lock.
- Fail-closed behavior for complete malformed or tampered records.
- Typed lifecycle transition validation.
- Trusted-project `pi_ios_runtime` status/initialize tool.

## Slice 3.2 — Repository baseline and configuration

Status: Next

- Versioned configuration schema and migration.
- Repository identity validation.
- Base/integration branch discovery.
- Clean committed baseline contract.
- Diagnostic status without mutation.

## Slice 3.3 — Sessions, worktrees, claims, and leases

Status: Pending

- Writer session records.
- Branch/worktree creation and preservation.
- Path normalization and overlap detection.
- Session and heartbeat leases.
- Conservative stale/orphan reconciliation.

## Slice 3.4 — Tool policy and preflight

Status: Pending

- Write-capable stage authorization.
- Edit/write path interception.
- Shell command parser and policy classes.
- Non-interactive fail-closed approval behavior.
- Preflight receipts bound to session and runtime revision.

## Slice 3.5 — Postflight and recovery

Status: Pending

- Changed-file scope attestation.
- Evidence requirements.
- Status and doctor diagnostics.
- Crash/fault injection tests.
- Work-preserving cleanup.
