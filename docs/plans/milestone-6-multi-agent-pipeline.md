# Milestone 6 — Multi-agent Pipeline

## Outcome

iDevFlow can execute an approved frozen work graph with isolated Pi subprocess workers, bounded parallelism, coordinator-only integration, combined verification, and conservative recovery. The deterministic kernel—not worker prose—owns task authority, retry budgets, receipts, integration order, and candidate state.

## Coordinator authority

`idev_pipeline` supports status, create, run, reconcile, high-risk approval, explicit lost-worker retry, pause, resume, takeover, and cancel. A hash-chained pipeline journal and atomic snapshot live under `.idevflow/pipeline/`. The coordinator lease is bound to one Pi session and is extended for the bounded run window. Takeover requires an expired lease, an interactive confirmation, and a reason.

Creation freezes:

- repository identity
- approved graph fingerprint
- approved plan commit
- integration epoch
- slice claims, dependencies, risks, acceptance criteria, and verification profiles

High-risk slices require a separate interactive approval. A run cannot silently widen claims, weaken verification, exceed configured concurrency, exceed its batch budget, or move to a different graph.

## Worker boundary

Each attempt receives an immutable JSON task packet containing only the bounded slice contract and deterministic identifiers. Packet digests are checked on every worker operation; credential-shaped packet content is rejected. A random capability is stored only as a SHA-256 hash and passed to the child process through an override-only environment variable.

Workers are separate supervised Pi processes launched in JSON mode with:

- a restricted built-in and custom tool list
- this extension loaded explicitly
- project/package extensions and prompt templates disabled
- fixed task procedure and packet path
- timeout, cancellation, process-group termination, bounded logs, and literal secret redaction

The worker must obtain exact packet-matching preflight, write only within its claimed worktree paths, review and repair while active, produce verification-bound postflight, finish one commit, run fresh integration verification, and submit a machine-readable passing verdict. It cannot integrate, approve risk, promote, push, upload, or distribute.

## Scheduling and repair

The scheduler selects dependency-ready slices, respects `maxConcurrency`, and never schedules overlapping claims together. Worker attempts and repair cycles are independently bounded by configuration. Exhausted repair, worker loss, failed process exit, invalid receipt, or denied risk blocks the pipeline without deleting source.

A lost or blocked slice can be returned to pending only by an interactive explicit retry. The prior branch, worktree, logs, packet, and journal records remain available for diagnosis.

## Integration epochs

Ready commits are integrated by the coordinator in a temporary worktree under the existing integration lock. A batch is prepared on a temporary branch and published with one compare-and-swap ref update only when the integration branch still matches the expected base.

If a multi-slice batch conflicts, the coordinator records the failure and recursively splits it. Successful sub-batches advance the expected base; irreducible conflicts are preserved as blocked source rather than auto-resolved by an LLM. Every batch result records source epoch, base, slices, resulting commit or error, and split ancestry.

## Combined candidate

After all slices integrate, iDevFlow creates or recovers a clean synthetic candidate worktree at the exact integration commit and runs combined integration verification. It records source-bound build, test, and review stage receipts, advances the lifecycle through `review_passed`, and stores a candidate snapshot binding:

- graph and plan
- original and final integration epochs
- all integrated slice commits and receipts
- combined verification fingerprint
- candidate worktree and commit

If the integration branch later advances, status deterministically changes the pipeline to `stale_candidate`. Release verification and TestFlight boundaries remain Milestone 5's separate explicit gates.

## Recovery and observation

`reconcile` reloads journal state, detects expired workers whose PIDs are no longer alive, records them as lost, and preserves all source. Re-running finalization reuses an exact clean candidate session after interruption. Runtime advancement resumes safely from any already-written intermediate lifecycle transition.

`/idevflow`, `idev_pipeline status`, and `idev_doctor` expose pipeline, slice, worker, batch, candidate, and expired-lease state. Complete worker output is redacted before persistence; capability and model credential values are explicit literal redactions and are not inherited by build subprocesses.

## Configuration

Schema version 4 adds bounded pipeline settings for:

- concurrency and slices
- batches per run
- repair cycles and worker attempts
- coordinator and worker leases
- worker timeout
- candidate worktree location

Schemas 0–3 migrate to conservative defaults with backup and validation.

## Proof

Automated coverage includes:

- immutable, secret-free packet hashing and tamper detection
- hash-chained pipeline journal replay and partial-tail repair
- deterministic worker capability, receipt, verdict, and repair enforcement
- worker-loss reconciliation and explicit retry
- a real separately supervised worker process boundary with capability redaction
- two independent parallel slices
- forced batch failure followed by recursive split integration
- combined candidate verification and lifecycle advancement
- integration drift causing stale-candidate detection

Milestone exit criterion: satisfied. Independent slices execute concurrently and integrate without transferring coordinator, approval, release, or distribution authority to workers.
