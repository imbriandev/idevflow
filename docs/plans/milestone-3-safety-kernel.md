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

Status: Implemented

- Versioned configuration schema, validation, schema-zero migration, and backup.
- Shared Git-common-directory identity across worktrees.
- Base/integration branch-name validation and base commit discovery.
- Live clean, committed primary-baseline contract.
- Local `.pi-ios/` exclusion through Git metadata without editing tracked ignore files.
- Read-only runtime, baseline, and writer status through `/ios` and `pi_ios_runtime`.

## Slice 3.3 — Sessions, worktrees, claims, and leases

Status: Implemented

- Hash-chained writer-session registry and atomic snapshot.
- Unique branch and sibling worktree per writer.
- Segment-aware normalized claims with symlink traversal rejection.
- Claim serialization under the registry lock.
- Session leases, automatic turn heartbeat, park, and conflict-checked resume.
- Conservative stale and orphan diagnostics that preserve source.

## Slice 3.4 — Tool policy and preflight

Status: Implemented

- Active-stage and write-capability authorization.
- Trusted-project runtime prerequisite and live repository baseline.
- `edit`/`write` interception, safe path rewriting, and claim enforcement.
- Strict read-only Bash parser; compounds, expansion, redirection, mutation, and unknown commands fail closed.
- Managed Git/Swift/Xcode/simulator execution in the writer worktree.
- Interactive-only repair approval and non-interactive fail-closed behavior.

## Slice 3.5 — Postflight and recovery

Status: Implemented

- Changed-file enumeration and claim-scope attestation.
- `git diff --check`, non-empty evidence, and content fingerprint receipt.
- Source-change rejection after postflight.
- Controlled claim-only commit with HEAD, commit-path, hook-dirtiness, and final-worktree checks.
- Status, heartbeat, park/resume, doctor status, and conservative repair.
- Adversarial tests for claim races, shell mutation, symlink escape, stale revisions, partial journals, and tampering.

## Milestone exit

Status: Complete

The safety kernel now fails closed before unauthorized writes, serializes ownership across processes, preserves isolated source across interruption, and requires a current postflight receipt before a writer commit can become ready for future controlled integration. Xcode evidence semantics and integration/promotion remain intentionally in later milestones.
