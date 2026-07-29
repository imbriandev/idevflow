# Rewrite Parity Matrix

This is a living acceptance ledger. `Pending` means the behavior has not yet been implemented and proven in Pi iOS.

| Area | Required behavior | Target module | Status |
| --- | --- | --- | --- |
| Commands | Seven lifecycle commands | `commands/` | Foundation |
| Skills | Progressive stage expertise | `skills/` | Foundation |
| Contracts | Ready, done, forbidden, evidence, backward route | `lifecycle/` | Foundation |
| State | Atomic, recoverable, versioned project state | `state/` | Foundation implemented |
| Git | Clean baseline and repository identity | `git/` | Safety baseline implemented |
| Worktrees | Isolated branch/worktree per writer | `git/` | Implemented |
| Claims | Path ownership and overlap detection | `git/` | Implemented |
| Leases | Session, coordinator, worker, simulator leases | `state/`, `simulator/` | Writer leases implemented; coordinator/simulator pending |
| Preflight | Stage/risk/scope/write authorization | `lifecycle/` | Implemented |
| Postflight | Changed-file and evidence attestation | `lifecycle/` | Safety receipt implemented; Xcode evidence pending |
| Recovery | Status, doctor, stale/orphan handling | `state/` | Implemented without destructive cleanup |
| Process | Cancellation, timeout, redaction, truncation | `process/` | Managed exec timeout/truncation implemented; artifact redaction pending |
| Xcode | Project, scheme, destination discovery | `xcode/` | Pending |
| Simulator | Exclusive lease, boot, release | `simulator/` | Pending |
| Verification | quick/slice/integration/release profiles | `verification/` | Pending |
| Receipts | Source/toolchain/config-bound reuse | `verification/` | Pending |
| Quality | Simulator, screenshot, accessibility, performance | `verification/` | Pending |
| Automation | Frozen work graph and approval | `pipeline/` | Pending |
| Workers | Isolated Pi worker execution | `workers/` | Pending |
| Pipeline | build-test-review and bounded repair | `pipeline/` | Pending |
| Integration | Combined candidate and stale snapshot checks | `git/`, `pipeline/` | Pending |
| Privacy | Privacy/security review gate | `release/` | Pending |
| Monetization | StoreKit readiness and optional reconciliation | `release/` | Pending |
| Release | Candidate-bound approval and promotion | `release/` | Pending |
| TestFlight | Verified manual handoff by default | `release/` | Pending |
| Observability | Bounded events, metrics, debug report | `state/` | Pending |
| Context | Triggered references and context budget | `lifecycle/` | Pending |
| Packaging | Local, Git, and eventual npm installation | package root | Foundation |
| Migration | Schema/config migration without source loss | `state/` | Config migration foundation implemented |
| Tests | Unit, integration, fault, Pi, Xcode E2E | `tests/` | Milestone-3 adversarial/integration coverage implemented |
