# Changelog

## 0.3.0-beta.14 — 2026-08-06

- Add a founder-confirmed, transactional `idev_flow bootstrap_ios` precondition for new clean Git repositories.
- Generate an XcodeGen SwiftUI app shell with unit tests, privacy manifest, shared scheme, iOS Simulator build, and one scaffold commit; it creates no lifecycle branch.

## 0.3.0-beta.13 — 2026-08-06

- Let `idev_flow continue` complete the interactive definition-acceptance checkpoint.
- Add founder-facade maintenance and bounded test-repair actions, backed by the existing lifecycle authority.
- Remove the unused stage dashboard formatter and move definition acceptance into the lifecycle service for reuse.

## 0.3.0-beta.12 — 2026-08-06

- Remove the unproven multi-agent pipeline and worker runtime from the production package (983 runtime LOC plus associated tools/tests).
- Keep one durable writer-session delivery run with safe cross-chat handoff and recovery.
- Migrate configuration to schema 9, dropping retired schema-8 pipeline settings without deleting preserved source or runtime data.
- Simplify coordinator, diagnostics, tool-gate, process environment, and documentation to the single-founder operating path.

## 0.3.0-beta.11 — 2026-08-06

- Make `idev_flow` the documented founder entry point; typed tools remain evidence-producing kernel details.
- Keep slash-command stage hints only for the current Pi chat; durable project state routes resumed chats.
- Stop coordinator reads from mutating expired writer leases, and skip routine pipeline scans when multi-agent operation is disabled.
- Remove candidate and platform-matrix reads from normal coordinator routing; release operations retain their direct candidate checks.

## 0.3.0-beta.10 — 2026-08-06

- Default new projects to one founder-owned delivery run, with multi-agent pipeline opt-in.
- Add founder-facade plan approval and routine completed-work continuation.
- Default internal TestFlight to fresh Release build/test evidence; preserve full proof gates for migrated projects and opt-in full release evidence.
- Let one founder approval promote, archive, export, and upload the exact internal TestFlight candidate; tester selection and distribution remain manual.
- Ignore stale Pi stage hints when durable lifecycle/writer state has moved, and prune expired verification resources.

## 0.3.0-beta.9 — 2026-08-05

- Allow a coordinator to integrate the one completed writer session awaiting integration even when it was created by an earlier Pi chat.

## 0.3.0-beta.8 — 2026-08-05

- Deepen existing-project audit and persist an exact-HEAD adoption snapshot.
- Route existing projects through one founder continuation decision; diagnose dirty baselines before repair.
- Record durable external validation blockers and require their evidence before candidate creation.
- Distinguish completed sessions awaiting founder integration from active writers.
- Create candidate-bound signed-archive receipts and document Apple release authority boundaries.

## 0.3.0-beta.7 — 2026-08-05

- Keep define, plan, and learn verification documentation-only even when their risk is high or critical.
- Add a founder-confirmed bounded test-repair route that preserves the prior lifecycle after fresh evidence.

## 0.3.0-beta.6 — 2026-08-05

- Add `idev_apple` signing audits, founder-confirmed device provisioning, and exact-candidate local archives.
- Keep Apple Developer operations coordinator-only; workers receive no signing, provisioning, upload, or distribution authority.
- Require a clean primary worktree at the promoted candidate commit before archiving.

## 0.3.0-beta.5 — 2026-08-05

- Harden recovery for orphan writer sessions, stuck locks, partial registry tails, simulator leases, and explicit pipeline coordinator takeover.

## 0.3.0-beta.4 — 2026-08-05

- Add a read-only existing-project audit and explicit adoption acknowledgement before lifecycle definition.
- Make the dashboard distinguish an existing project from an iDevFlow-adopted project.
- Notify at Pi session start when the public npm beta tag differs from the installed version; the lookup sends no project data and can be disabled.
- Add an explicit post-handoff maintenance loop that requires a user-visible reason and returns to planning without treating a shipped app as current evidence.
- Add primary-flow quality contracts, measured metric learning evidence, and macOS product-experience guidance.
- Add opt-in, source-bound AI visual review using the active Pi provider/model.

## 0.3.0-beta.3 — 2026-08-05

- Add a read-only existing-project audit route when an Apple-platform project is detected before lifecycle adoption.
- Clarify npm and Git project-local installation paths and update guidance.

## 0.3.0-beta.2 — 2026-08-03

- Release the project under the iDevFlow brand and `idevflow` package identity.
- Rename commands to `/idev:*`, tools to `idev_*`, and local runtime state to `.idevflow/`.
- Preserve project state through automatic migration from `.canopy/` and `.pi-ios/`.
- Verify iOS, macOS, universal-platform, and manual TestFlight handoff paths on Xcode 26 CI.

Historical tags before this release use earlier product names.
