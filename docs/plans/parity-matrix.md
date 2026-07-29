# Rewrite Parity Matrix

This is a living acceptance ledger. `Pending` means the behavior has not yet been implemented and proven in Pi iOS.

| Area | Required behavior | Target module | Status |
| --- | --- | --- | --- |
| Commands | Seven lifecycle commands | `commands/` | Full single-agent lifecycle wired |
| Skills | Progressive stage expertise | `skills/` | Full lifecycle tool routes documented |
| Contracts | Ready, done, forbidden, evidence, backward route | `lifecycle/` | Deterministic stage transitions and receipts implemented |
| State | Atomic, recoverable, versioned project state | `state/` | Foundation implemented |
| Git | Clean baseline and repository identity | `git/` | Safety baseline implemented |
| Worktrees | Isolated branch/worktree per writer | `git/` | Implemented |
| Claims | Path ownership and overlap detection | `git/` | Implemented |
| Leases | Session, coordinator, worker, simulator leases | `state/`, `simulator/` | Writer and simulator leases implemented; coordinator pending |
| Preflight | Stage/risk/scope/write authorization | `lifecycle/` | Implemented |
| Postflight | Changed-file and evidence attestation | `lifecycle/` | Verification-bound postflight implemented |
| Recovery | Status, doctor, stale/orphan handling | `state/` | Implemented without destructive cleanup |
| Process | Cancellation, timeout, redaction, truncation | `process/` | Implemented with secret-scanned artifacts |
| Xcode | Project, scheme, destination discovery | `xcode/` | Implemented and real-app tested |
| Simulator | Exclusive lease, boot, release | `simulator/` | Implemented with screenshot capture |
| Verification | quick/slice/integration/release profiles | `verification/` | Implemented with adaptive minimum strength |
| Receipts | Source/toolchain/config-bound reuse | `verification/` | Implemented; release reuse forbidden |
| Quality | Simulator, screenshot, accessibility, performance | `verification/` | Proof contracts and release gate implemented |
| Automation | Frozen work graph and approval | `planning/`, `lifecycle/` | Single-agent graph and exact interactive approval implemented |
| Workers | Isolated Pi worker execution | `workers/` | Pending |
| Pipeline | build-test-review and bounded repair | `pipeline/` | Pending |
| Integration | Combined candidate and stale snapshot checks | `git/`, `pipeline/` | Single-agent fast-forward integration and stale candidate checks implemented; epochs deferred |
| Privacy | Privacy/security review gate | `release/` | Implemented with unresolved-severity blocking |
| Monetization | StoreKit readiness and optional reconciliation | `release/` | Detection, not-required, and manifest reconciliation gate implemented |
| Release | Candidate-bound approval and promotion | `release/` | Expiring single-use approval and exact local promotion implemented |
| TestFlight | Verified manual handoff by default | `release/` | Evidence package and explicit no-upload boundary implemented |
| Observability | Bounded events, metrics, debug report | `state/` | Pending |
| Context | Triggered references and context budget | `lifecycle/` | Stage contracts and progressive skills implemented; specialist cold references pending |
| Packaging | Local, Git, and eventual npm installation | package root | Foundation |
| Migration | Schema/config migration without source loss | `state/` | Config migration foundation implemented |
| Tests | Unit, integration, fault, Pi, Xcode E2E | `tests/` | Full single-agent golden path plus Milestone-4 real Xcode E2E implemented |
