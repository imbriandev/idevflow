# Architecture Overview

## Mission

Pi iOS turns a founder's product intent into a narrow iOS product, an approved implementation graph, isolated code changes, artifact-backed verification, and a deliberate TestFlight handoff.

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

### Skills

Skills provide progressively disclosed expertise for seven stages:

1. Define — product bet and Simple, Lovable, Complete scope.
2. Plan — architecture and vertical slices.
3. Build — one authorized implementation slice.
4. Test — reproduce, repair, and prove behavior.
5. Review — product and engineering quality verdict.
6. Ship — release verification and TestFlight handoff decision.
7. Learn — feedback synthesis and next focus.

Skills may recommend actions but cannot mutate workflow state directly. State changes pass through typed tools.

### Worker runtime

Workers run as isolated Pi processes in extension-created Git worktrees. A worker receives:

- a bounded task packet
- a stage-specific system prompt
- only relevant skills and references
- a restricted tool set
- claimed paths
- risk and verification requirements

Workers can produce source commits and receipts. They cannot integrate, promote, push, upload, or distribute.

### Project state

Durable state belongs to `.appforge/` in the iOS app repository, independently of Pi conversation sessions. Pi custom entries mirror session-local UI state but are not the source of truth.

## Package topology

```text
extensions/appforge/
  commands/       command registration and argument handling
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
- `before_agent_start` injects the current stage contract and bounded state.
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

## Release boundary

The default result is a verified TestFlight handoff. The kernel prepares and validates the candidate, archive readiness, privacy state, known issues, and evidence bundle. Upload or distribution remains a separate explicit capability and approval boundary.
