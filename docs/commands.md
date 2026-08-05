# Commands and tools

## Commands

| Command | Use |
| --- | --- |
| `/idev` | Show the safe dashboard and current route |
| `/idev:define` | Define or refine the product bet |
| `/idev:plan` | Create or review the implementation graph |
| `/idev:build` | Implement an approved slice |
| `/idev:test` | Reproduce, fix, and verify behavior |
| `/idev:review` | Produce a source-bound review verdict |
| `/idev:ship` | Create a release candidate and handoff |
| `/idev:learn` | Record feedback and the next decision |

Commands are optional entry points. Typed tools remain authoritative. For an existing Apple-platform project whose runtime is still `idea`, `/idev` assesses it read-only, then records adoption and the founder’s stated near-term outcome before definition. This is a coordinator route, not a lifecycle stage or slash command.

## Runtime and recovery

- `idev_runtime` — initialize, inspect, migrate, adopt an existing project, and select its repair/release-validation/feature continuation.
- `idev_blocker` — record and resolve classified code, verification, Apple, external-validation, and release blockers; external records can require ship-time evidence.
- `idev_doctor` — audit/report runtime state; repair partial session tails and expired leases; explicitly release an orphan writer or a confirmed stuck lock without deleting source.

## Context and lifecycle

- `idev_context` — select bounded package-owned specialist guidance and record context receipts.
- `idev_lifecycle` — start post-handoff maintenance, integrate work, approve plans, and record reviews.
- `idev_preflight` — authorize a writer worktree and path claims.
- `idev_session` — perform writer postflight and finish a session.

## Implementation and verification

- `idev_exec` — run an allowed supervised command during an authorized stage.
- `idev_verify` — run managed Xcode verification and emit receipts.
- `idev_simulator` — discover, lease, boot, and inspect simulator destinations.
- `idev_proof` — record simulator and XCTest-backed proof metadata.

## Release and coordination

- `idev_release` — create, approve, promote, and hand off release candidates.
- `idev_apple` — read signing settings, founder-confirm one development provisioning action, or create a local signed archive and receipt for an exact promoted candidate; never export, upload, or distribute.
- `idev_pipeline` — create, schedule, reconcile, observe, and integrate an approved work graph.
- `idev_pipeline_worker` — submit work from an authorized worker process.

See [Apple release capability matrix](release-capabilities.md) for the exact founder boundary at each release operation.

## Safety rule

Do not infer success from agent text, shell output copied into chat, or a process exit alone. Use the corresponding iDevFlow tool and inspect its receipt or structured result.
