# Milestone 5 — Full Lifecycle

## Status

Complete for the single-agent golden path.

Multi-agent scheduling, worker process isolation, integration epochs, and bounded repair orchestration remain Milestone 6.

## Delivered capabilities

### Product definition

The kernel validates tracked, versioned JSON documents for:

- durable product memory
- target user, problem, and promise
- Simple, Lovable, Complete scope
- explicit non-goals, success signals, and risks
- product decisions and rationale

The default paths are `docs/pi-ios/product-memory.json` and `docs/pi-ios/slc.json`. Their canonical content produces the product fingerprint consumed by planning.

### Architecture and work graph

The plan gate validates:

- accepted architecture decisions
- source product fingerprint
- vertical slices and acceptance criteria
- risk and verification profile
- project-relative claimed paths
- existing dependencies
- acyclic dependency structure
- no overlapping claims between unordered slices

Interactive plan approval is bound to the exact graph fingerprint and integration commit. No implementation stage can pass before `plan_approved`.

### Controlled single-agent integration

Finished writer commits are fast-forwarded to the configured integration branch under an exclusive cross-process lock. Integration requires:

- a clean, unchanged ready writer branch
- an unchanged integration head matching the writer base
- exact postflight and verification evidence
- valid stage documents
- approved graph ancestry for build work
- build claims mapping to exactly one approved slice

Integration occurs in a temporary worktree when the integration branch is not currently checked out. Writer claims are released only after the exact commit lands and an integration receipt is durable.

### Stage receipts

The kernel emits source-bound receipts for:

- define
- plan
- build
- test
- review
- learn (without erasing the completed handoff state)

Build and test receipts link the pre-commit content-bound verification, controlled commit, and exact integration receipt. Review verdicts are machine-readable and require integration-or-stronger verification for the current integrated commit. A passing verdict cannot contain critical or high findings.

### Privacy and monetization gates

Privacy readiness requires a versioned review with explicit data practices, permissions, findings, evidence, and a `go` decision. Unresolved critical or high findings block release.

The monetization gate conservatively detects StoreKit and RevenueCat source. If monetization is absent, the gate records `not_required`. If detected, it requires unique products, entitlement/paywall identity, App Store and provider snapshot fingerprints, and a complete required proof set.

### Candidate and release boundary

Candidate creation requires:

- lifecycle `review_passed`
- exact current integration commit
- fresh, non-reused `release` verification
- an Xcode app project/workspace
- build and test xcresult artifacts
- parsed test summary
- simulator, all configured screenshot variants, accessibility, and performance proof
- matching Xcode/release bundle identifier
- passing privacy and monetization gates
- HTTPS release metadata and exact TestFlight target

The candidate fingerprint binds commit, target, release verification, artifact hashes, privacy, monetization, and release manifest.

### Approval, promotion, and handoff

Ship approval is:

- interactive-only
- expiring
- random and stored only as a hash
- single-use
- bound to candidate fingerprint, commit, and target

Promotion rechecks candidate commit and artifact integrity, consumes the approval atomically, and fast-forwards only the local base branch. It works whether the primary worktree currently has the base or integration branch checked out. It never pushes, archives, uploads, or distributes.

The final handoff revalidates promoted commit and artifacts, writes a durable evidence package, advances lifecycle to `testflight_handoff`, and records explicit manual next steps. The handoff states `pushed: false`, `uploaded: false`, and `distributed: false`.

## Golden-path proof

`tests/full-lifecycle.test.ts` runs one trusted repository through:

1. runtime initialization
2. define documents, verification, commit, integration, and receipt
3. graph creation, verification, integration, and founder approval
4. approved build slice, verification, commit, integration, and receipt
5. test change, verification, commit, integration, and receipt
6. source-bound review pass
7. privacy and no-monetization gates
8. fresh release evidence and candidate creation
9. candidate-bound approval
10. local base-branch promotion from an integration-checked-out primary worktree
11. verified manual TestFlight handoff
12. authorized learning update integrated without changing the completed handoff state

The final runtime state is `testflight_handoff`, and the base branch resolves to the exact candidate commit.
