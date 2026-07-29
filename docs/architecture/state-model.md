# Runtime State Model

## Durable locations

An installed project uses:

```text
.appforge/
  config.json
  state/events.jsonl
  state/snapshot.json
  state/locks/
  state/sessions/events.jsonl
  state/sessions/snapshot.json
  pipeline/events/<pipeline>.jsonl
  pipeline/snapshots/<pipeline>.json
  pipeline/packets/<packet>.json
  pipeline/logs/<run>/{stdout,stderr}.log
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

## Pipeline state

A pipeline snapshot is derived from its own append-only hash-chained journal under the same atomic locking discipline. It freezes the approved graph and plan commit, coordinator lease, integration epoch, slice dependency and claim state, worker attempts and leases, repair counts, batch outcomes, and the combined candidate snapshot.

Worker task packets are immutable digest-bound files. Capability values never enter the snapshot or journal; only their hashes do. Packet, session, postflight, verification, test, and review fingerprints bind a submitted slice to one finished source commit.

Coordinator integration records every attempted batch. Publication is compare-and-swap against the expected integration head. A failed multi-slice batch can split recursively; no recovery deletes a worker branch, worktree, packet, or log. Integration drift after combined verification changes the pipeline status to `stale_candidate`.

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
