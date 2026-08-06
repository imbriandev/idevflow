# Architecture Overview

## Mission

iDevFlow turns a founder's product intent into a narrow Apple-platform product, an approved implementation graph, isolated code changes, and artifact-backed verification. It supports founder-approved internal TestFlight upload and macOS distribution readiness; push, tester selection, distribution, and macOS notarization remain manual boundaries.

It is not a prompt pack. It is a deterministic workflow kernel integrated with Pi's commands, skills, tools, events, sessions, and TUI.

## System boundaries

### Extension kernel

The TypeScript extension owns:

- lifecycle state and legal transitions
- configuration and schema migration
- Git baseline, branches, worktrees, claims, leases, and integration
- command authorization and write gates
- Xcode and simulator resource coordination
- verification policy, receipts, evidence, and artifacts
- approval tokens and candidate promotion
- recovery diagnostics and cleanup

These behaviors must not depend on an LLM correctly remembering prose.

### Conversational coordinator

The coordinator is one founder-facing conversational layer, not a second workflow engine. At Pi interaction boundaries it projects sanitized durable runtime, baseline, and writer-session state into a safe next-route brief. It prioritizes recovery of an owned writer over new work.

It cannot mutate lifecycle state or infer approval from prose. It creates no background daemon, retains no separate authoritative state, and does not expose task text, capabilities, credentials, or worktree paths in the founder dashboard. `/idev` renders the same safe projection; the seven stage commands remain manual escape hatches.

### Skills

Skills provide progressively disclosed Apple-platform expertise for seven stages:

1. Define — product bet and Simple, Lovable, Complete scope.
2. Plan — architecture and vertical slices.
3. Build — one authorized implementation slice.
4. Test — reproduce, repair, and prove behavior.
5. Review — product and engineering quality verdict.
6. Ship — release verification and platform-specific handoff decision.
7. Learn — feedback synthesis and next focus.

Skills may recommend actions but cannot mutate workflow state directly. State changes pass through typed tools. For non-trivial Apple-platform work, `idev_context` deterministically selects a bounded cold path from the package-owned specialist knowledge base; skills then read only selected references. The current reference set is iOS-focused while verification supports iOS, macOS, and universal projects. This improves domain reasoning without loading all guidance or granting authority.

### Project state

Durable state belongs to `.idevflow/` in the iOS app repository, independently of Pi conversation sessions. Pi custom entries mirror session-local UI state but are not the source of truth.

## Package topology

```text
extensions/idevflow/
  commands/       command registration and argument handling
  coordinator/    state projection and conversational brief
  lifecycle/      contracts, transitions, risk, and policy
  state/          event journal, snapshots, locking, migrations
  git/            worktrees, claims, integration, promotion
  process/        cancellation, timeout, redaction, truncation
  xcode/          project discovery and xcodebuild execution
  simulator/      device discovery, leases, boot, and cleanup
  verification/   profiles, fingerprints, receipts, evidence
  release/        verified iOS and macOS distribution handoffs
  ui/             status, dashboard, approvals, and renderers
skills/           progressive iOS stage guidance
references/       cold-path specialist guidance
templates/        project memory and evidence templates
```

## Pi integration

- `registerCommand` exposes the lifecycle and dashboard commands.
- `registerTool` exposes typed kernel operations to agents.
- `tool_call` enforces write and shell policy before execution.
- `before_agent_start` refreshes owned leases and injects the current stage contract plus a sanitized coordinator route.
- `session_start` starts with a clean UI hint and reads durable project state.
- `setStatus` and `setWidget` show stage and gate progress.
- `ctx.ui.confirm` performs human approvals in interactive/RPC modes.
- non-interactive approval-requiring operations fail closed.

## Security invariants

1. No source write before successful write preflight.
2. No write outside the current worktree and claimed paths.
3. No integration from a dirty or uncommitted writer tree.
4. No verification receipt without an exact source fingerprint.
5. No candidate approval reusable for another commit or target.
6. No push, upload, or distribution implied by candidate approval.
8. No secret included in model-visible output or persisted artifact.
9. No crash recovery operation deletes unintegrated work.
10. No LLM prose alone advances a lifecycle transition.

## Safety-kernel implementation

Milestone 3 establishes two hash-chained project journals: lifecycle state and writer-session ownership. The kernel creates writer branches and sibling worktrees, serializes path claims under a cross-process lock, refreshes leases on active turns, and preserves parked, stale, conflicted, or orphaned source for diagnosis.

When a iDevFlow stage is active, built-in `edit` and `write` calls are redirected to the authorized worktree only after symlink-safe containment and claim checks. Direct Bash is limited to a strict read-only subset. Build and test processes use a managed typed tool with fixed executable policy, worktree cwd, timeout, cancellation, and output truncation.

Postflight records changed paths, evidence, and a content fingerprint. Finish rejects source drift, unexpected HEAD changes, out-of-claim commit paths, and changes left by commit hooks before marking a commit ready for later integration.

## Xcode verification harness

The verification kernel discovers the project container, scheme, platform-specific deployment target, build settings, and Apple toolchain. iOS acquires an exclusive simulator destination; macOS runs against the native Mac destination without a simulator lease. It runs shell-free supervised commands with isolated DerivedData, cancellation, timeout, bounded diagnostics, redacted complete logs, xcresult output, and post-run artifact secret scanning.

Adaptive profiles select the minimum allowed strength from stage, risk, and changed files. Receipts bind source and dirty content to configuration, platform, project, toolchain, destination, profile, proof files, and artifact hashes. Universal projects produce one matrix receipt whose iOS and macOS child receipts share the exact source fingerprint; a missing or stale required platform invalidates the matrix. Exact non-release receipts may be reused only while every artifact remains intact; release proof is always fresh.

Postflight accepts a verification fingerprint rather than prose. It validates receipt ownership, source identity, minimum profile, and artifact integrity before recording its own commit-bound attestation.

## Full single-agent lifecycle

Tracked product memory and SLC documents produce the definition fingerprint. A machine-readable architecture/work graph binds that fingerprint to accepted decisions, dependency-valid vertical slices, path claims, risk, acceptance, and verification strength. Interactive plan approval binds the exact graph and plan commit.

Completed writer commits fast-forward onto the integration branch under a lock. Define, plan, build, test, review, and post-handoff learning produce local source-bound receipts. Build integration must descend from the approved plan and map claims to exactly one approved slice. Machine-readable review verdicts apply only to the currently verified integration commit.

## Release boundary

For iOS, the default result is a founder-approved internal TestFlight upload. Candidate creation requires fresh Release build/test evidence, privacy readiness, monetization reconciliation when detected, exact bundle/target metadata, and known issues. Screenshots plus XCTest accessibility/performance evidence are opt-in full-release gates. One interactive approval binds the exact candidate, promotion, archive, export, and upload; Pi never pushes, selects testers, or distributes.

For macOS, iDevFlow emits a source-bound Mac App Store or notarized-distribution readiness handoff after the corresponding security and release gates pass. Handoff packages explicitly record that push, signing, archive/upload, notarization, and distribution did not occur; each remains a manual boundary.
