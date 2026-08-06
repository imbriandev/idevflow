# Runtime State Model

## Durable locations

An installed project uses:

```text
.idevflow/
  config.json
  state/events.jsonl
  state/snapshot.json
  state/locks/
  state/sessions/events.jsonl
  state/sessions/snapshot.json
  sessions/
  graphs/
  receipts/verification/<fingerprint>.json
  receipts/context/<session>-<stage>.json
  receipts/integration/<session>.json
  receipts/stages/<stage>-<commit>.json
  approvals/plan.json
  approvals/promotion.json
  release/candidate.json
  release/handoff-<candidate>.json
  evidence/<session>/
  artifacts/verification/<fingerprint>/
  resources/<session>/
  logs/
```

The directory contains generated local runtime data and is ignored by default. Durable product documents remain normal tracked project files.

## Event journal

The lifecycle and writer-session journals are append-only. Every event contains:

- schema version
- event id and timestamp
- repository identity
- actor and Pi session id
- event kind
- previous state revision
- typed payload
- optional Git commit and graph fingerprint

A snapshot records the last applied event id and derived state. Writes use domain-specific repository locks, temporary files, fsync boundaries, and atomic rename. Writer claims are checked and appended while holding the same registry lock, preventing concurrent ownership races.

## Lifecycle states

```text
idea
  -> defined
  -> planned
  -> plan_approved
  -> building
  -> built
  -> testing
  -> tested
  -> reviewing
  -> review_passed
  -> candidate_verified
  -> ready_for_ship_approval
  -> promoted
  -> testflight_handoff
  -> defined (next explicitly redefined cycle)
```

Interrupt states are `blocked`, `fix_required`, `manual_decision_required`, `verification_failed`, `stale_candidate`, `conflicted`, and `parked`.

Transitions are contract functions with explicit prerequisites and emitted events. A transition never parses an assistant response to discover whether prerequisites passed.

## Specialist context receipts

A selected specialist cold path becomes a durable context receipt only when attached to an eligible writer session. It records stage, risk, task, selected package-reference identifiers/relative paths, selection fingerprint, and timestamp under a context-receipt lock. High/critical verification and review require a matching receipt; release verification requires a separate `ship`/`critical` receipt. The verification fingerprint includes that selection fingerprint.

## Session hint

Slash commands create an in-memory hint only for the current Pi chat. On resume, the extension reads durable lifecycle and writer-session state; it never restores a stage from chat history.

## Approvals

An approval token is single-use, expires, and is cryptographically bound to:

- action
- repository identity
- source or candidate commit
- work graph revision and fingerprint when applicable
- verification manifest hash
- distribution target
- approving actor

Promotion and push use separate tokens.

## Recovery

Recovery is conservative:

- expired leases become stale, not deleted
- orphan worktrees remain discoverable
- interrupted commands record incomplete events
- snapshots can be rebuilt from the journal
- artifact hashes are revalidated before reuse
- `doctor --repair` changes registry state but does not discard source
