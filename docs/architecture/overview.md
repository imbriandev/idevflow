# Architecture Overview

## Mission

Pi iOS turns a founder's product intent into a narrow Apple-platform product, an approved implementation graph, isolated code changes, and artifact-backed verification. iOS additionally supports a deliberate TestFlight handoff; macOS release support remains a later milestone.

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
- worker scheduling and reconciliation
- recovery diagnostics and cleanup

These behaviors must not depend on an LLM correctly remembering prose.

### Conversational coordinator

The coordinator is one founder-facing conversational layer, not a second workflow engine. At Pi interaction boundaries it projects sanitized durable runtime, baseline, writer-session, pipeline, and candidate state into a safe next-route brief. It prioritizes recovery of an owned writer or active pipeline over new work, and recommends worker delegation only for independent low/medium-risk slices of an exact approved graph.

It cannot mutate lifecycle state or infer approval from prose. It creates no background daemon, retains no separate authoritative state, and does not expose task text, capabilities, credentials, or worktree paths in the founder dashboard. `/ios` renders the same safe projection; the seven stage commands remain manual escape hatches.

### Skills

Skills provide progressively disclosed expertise for seven stages:

1. Define — product bet and Simple, Lovable, Complete scope.
2. Plan — architecture and vertical slices.
3. Build — one authorized implementation slice.
4. Test — reproduce, repair, and prove behavior.
5. Review — product and engineering quality verdict.
6. Ship — release verification and TestFlight handoff decision.
7. Learn — feedback synthesis and next focus.

Skills may recommend actions but cannot mutate workflow state directly. State changes pass through typed tools. For non-trivial Apple-platform work, `pi_ios_context` deterministically selects a bounded cold path from the package-owned specialist knowledge base; skills then read only selected references. This improves domain reasoning without loading all guidance or granting authority.

### Worker runtime

Workers run as isolated Pi processes in extension-created Git worktrees. A worker receives:

- a bounded task packet
- a stage-specific system prompt
- only relevant skills and references
- a restricted tool set
- claimed paths
- risk and verification requirements

Workers can produce source commits and receipts. They cannot integrate, approve risk, retry themselves, promote, push, upload, or distribute. Their packets are digest-checked and secret-free; their random capabilities are hash-only at rest and redacted from logs.

### Project state

Durable state belongs to `.pi-ios/` in the iOS app repository, independently of Pi conversation sessions. Pi custom entries mirror session-local UI state but are not the source of truth.

## Package topology

```text
extensions/pi-ios/
  commands/       command registration and argument handling
  coordinator/    state projection, conversational brief, delegation policy
  lifecycle/      contracts, transitions, risk, and policy
  state/          event journal, snapshots, locking, migrations
  git/            worktrees, claims, integration, promotion
  process/        cancellation, timeout, redaction, truncation
  xcode/          project discovery and xcodebuild execution
  simulator/      device discovery, leases, boot, and cleanup
  verification/   profiles, fingerprints, receipts, evidence
  pipeline/       work graph, scheduler, repair, reconciliation
  release/        candidate and TestFlight handoff
  workers/        isolated Pi worker processes and task packets
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
- `session_start` restores the session mirror and dashboard.
- `appendEntry` records branch-aware UI state, never authoritative project state.
- `setStatus` and `setWidget` show stage and gate progress.
- `ctx.ui.confirm` performs human approvals in interactive/RPC modes.
- non-interactive approval-requiring operations fail closed.

## Security invariants

1. No source write before successful write preflight.
2. No write outside the current worktree and claimed paths.
3. No integration from a dirty or uncommitted worker tree.
4. No verification receipt without an exact source fingerprint.
5. No candidate approval reusable for another commit or target.
6. No push, upload, or distribution implied by candidate approval.
7. No project-local worker prompt loaded before project trust.
8. No secret included in model-visible output or persisted artifact.
9. No crash recovery operation deletes unintegrated work.
10. No LLM prose alone advances a lifecycle transition.

## Safety-kernel implementation

Milestone 3 establishes two hash-chained project journals: lifecycle state and writer-session ownership. The kernel creates writer branches and sibling worktrees, serializes path claims under a cross-process lock, refreshes leases on active turns, and preserves parked, stale, conflicted, or orphaned source for diagnosis.

When a Pi iOS stage is active, built-in `edit` and `write` calls are redirected to the authorized worktree only after symlink-safe containment and claim checks. Direct Bash is limited to a strict read-only subset. Build and test processes use a managed typed tool with fixed executable policy, worktree cwd, timeout, cancellation, and output truncation.

Postflight records changed paths, evidence, and a content fingerprint. Finish rejects source drift, unexpected HEAD changes, out-of-claim commit paths, and changes left by commit hooks before marking a commit ready for later integration.

## Xcode verification harness

The verification kernel discovers the project container, scheme, platform-specific deployment target, build settings, and Apple toolchain. iOS acquires an exclusive simulator destination; macOS runs against the native Mac destination without a simulator lease. It runs shell-free supervised commands with isolated DerivedData, cancellation, timeout, bounded diagnostics, redacted complete logs, xcresult output, and post-run artifact secret scanning.

Adaptive profiles select the minimum allowed strength from stage, risk, and changed files. Receipts bind source and dirty content to configuration, platform, project, toolchain, destination, profile, proof files, and artifact hashes. Universal projects produce one matrix receipt whose iOS and macOS child receipts share the exact source fingerprint; a missing or stale required platform invalidates the matrix. Exact non-release receipts may be reused only while every artifact remains intact; release proof is always fresh.

Postflight accepts a verification fingerprint rather than prose. It validates receipt ownership, source identity, minimum profile, and artifact integrity before recording its own commit-bound attestation.

## Full single-agent lifecycle

Tracked product memory and SLC documents produce the definition fingerprint. A machine-readable architecture/work graph binds that fingerprint to accepted decisions, dependency-valid vertical slices, path claims, risk, acceptance, and verification strength. Interactive plan approval binds the exact graph and plan commit.

Completed writer commits fast-forward onto the integration branch under a lock. Define, plan, build, test, review, and post-handoff learning produce local source-bound receipts. Build integration must descend from the approved plan and map claims to exactly one approved slice. Machine-readable review verdicts apply only to the currently verified integration commit.

## Multi-agent pipeline

An approved graph is frozen into a durable pipeline record with a coordinator lease and integration epoch. The scheduler runs only dependency-ready, non-overlapping slices up to configured bounded concurrency. Each worker gets its own branch and worktree, repairs only through a finite deterministic budget, then submits test and review evidence bound to its finished commit.

The coordinator is the sole integration authority. It cherry-picks ready commits in an isolated temporary worktree under the integration lock and uses compare-and-swap publication. Failed multi-slice batches recursively split; conflicted source is retained rather than guessed away. Once every slice integrates, a clean candidate worktree receives fresh combined verification and advances the lifecycle to `review_passed`. Any later integration-branch drift makes that pipeline candidate stale.

Pipeline state is hash-chained independently of lifecycle and writer session state. Reconciliation detects lost workers, preserves their worktrees, and requires an explicit bounded retry. Dashboard and doctor diagnostics expose coordinator, worker, batch, and stale-candidate state.

## Release boundary

The default result is a verified TestFlight handoff. Candidate creation requires fresh release verification, xcresult/test evidence, source-bound visual/accessibility/performance proof, privacy readiness, monetization reconciliation when detected, exact bundle/target metadata, and known issues.

Interactive ship approval produces an expiring single-use capability bound to candidate commit, fingerprint, and target. Promotion fast-forwards only the local base branch. The handoff package explicitly records that push, archive/upload, and distribution did not occur; each remains a separate future capability and approval boundary.
