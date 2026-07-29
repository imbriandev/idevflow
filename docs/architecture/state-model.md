# Runtime State Model

## Durable locations

An installed project uses:

```text
.appforge/
  config.json
  state/events.jsonl
  state/snapshot.json
  state/locks/
  sessions/
  graphs/
  receipts/
  evidence/
  artifacts/
  logs/
```

The directory contains generated local runtime data and is ignored by default. Durable product documents remain normal tracked project files.

## Event journal

`events.jsonl` is append-only. Every event contains:

- schema version
- event id and timestamp
- repository identity
- actor and Pi session id
- event kind
- previous state revision
- typed payload
- optional Git commit and graph fingerprint

A snapshot records the last applied event id and derived state. Writes use a repository lock, temporary file, fsync where meaningful, and atomic rename.

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
```

Interrupt states are `blocked`, `fix_required`, `manual_decision_required`, `verification_failed`, `stale_candidate`, `conflicted`, and `parked`.

Transitions are contract functions with explicit prerequisites and emitted events. A transition never parses an assistant response to discover whether prerequisites passed.

## Session mirror

The Pi extension records a lightweight custom entry containing active stage, task id, runtime revision, and worktree. On resume it compares the mirror with project state. Project state wins, and divergence is surfaced rather than silently merged.

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
