# Rewrite Parity Matrix

This is a living acceptance ledger. `Pending` means the behavior has not yet been implemented and proven in Pi iOS.

| Area | Required behavior | Target module | Status |
| --- | --- | --- | --- |
| Commands | Seven lifecycle commands | `commands/` | Full single-agent lifecycle wired |
| Skills | Progressive stage expertise | `skills/`, `references/` | Seven lifecycle skills require bounded specialist context selection and surface-specific reasoning |
| Contracts | Ready, done, forbidden, evidence, backward route | `lifecycle/` | Deterministic stage transitions and receipts implemented |
| State | Atomic, recoverable, versioned project state | `state/` | Foundation implemented |
| Git | Clean baseline and repository identity | `git/` | Safety baseline implemented |
| Worktrees | Isolated branch/worktree per writer | `git/` | Implemented |
| Claims | Path ownership and overlap detection | `git/` | Implemented |
| Leases | Session, coordinator, worker, simulator leases | `state/`, `simulator/`, `pipeline/` | Implemented with bounded takeover and worker-loss reconciliation |
| Preflight | Stage/risk/scope/write authorization | `lifecycle/` | Implemented |
| Postflight | Changed-file and evidence attestation | `lifecycle/` | Verification-bound postflight implemented |
| Recovery | Status, doctor, stale/orphan handling | `state/`, `recovery/` | Non-destructive recovery, metadata-only diagnostics report, and corruption fault coverage implemented |
| Process | Cancellation, timeout, redaction, truncation | `process/` | Implemented with secret-scanned artifacts |
| Xcode | Project, scheme, destination discovery | `xcode/` | Implemented and real-app tested |
| Simulator | Exclusive lease, boot, release | `simulator/` | Implemented with screenshot capture |
| Verification | quick/slice/integration/release profiles | `verification/` | Implemented with adaptive minimum strength |
| Receipts | Source/toolchain/config-bound reuse | `verification/` | Implemented; release reuse forbidden |
| Quality | Simulator, screenshot, accessibility, performance | `verification/` | Fresh xcresult-backed XCTest accessibility audit, named test pass, project-owned performance-budget validation, screenshots, and release gate implemented |
| Automation | Frozen work graph and approval | `planning/`, `lifecycle/` | Single-agent graph and exact interactive approval implemented |
| Workers | Isolated Pi worker execution | `workers/` | Immutable packets, capability-bound restricted Pi subprocesses, supervision, and receipts implemented |
| Pipeline | build-test-review and bounded repair | `pipeline/` | Dependency scheduler, bounded concurrency/attempts/repair, durable verdicts, and recovery implemented |
| Integration | Combined candidate and stale snapshot checks | `git/`, `pipeline/` | Atomic integration epochs, recursive batch splitting, combined verification, and stale snapshot checks implemented |
| Privacy | Privacy/security review gate | `release/` | Implemented with unresolved-severity blocking |
| Monetization | StoreKit readiness and optional reconciliation | `release/` | Detection, not-required, and manifest reconciliation gate implemented |
| Release | Candidate-bound approval and promotion | `release/` | Expiring single-use approval and exact local promotion implemented |
| TestFlight | Verified manual handoff by default | `release/` | Evidence package and explicit no-upload boundary implemented |
| Observability | Bounded events, metrics, debug report | `state/`, `pipeline/`, `recovery/` | Hash-chained events, bounded worker logs, dashboard, doctor diagnostics, and versioned metadata-only report implemented |
| Context | Triggered references and context budget | `context/`, `references/`, `lifecycle/` | Deterministic selector, package cold references, 2.4k/3.2k budgets, worker access, and durable high/critical/release context receipts bound into verification/review implemented |
| Packaging | Local, Git, and eventual npm installation | package root | Local/Git loading, package smoke validation, installation/migration, and release-process documentation implemented |
| Migration | Schema/config migration without source loss | `state/`, `config/` | Versioned backup-and-atomic config migration and operator documentation implemented |
| Tests | Unit, integration, fault, Pi, Xcode E2E | `tests/`, `.github/` | Golden paths, corruption/recovery faults, mock-agent authority, UI fail-closed, expert-domain context scenarios, package smoke, runtime provenance gate, plus macOS Xcode verification and full real SampleApp handoff E2E CI implemented |
| Cutover | Stable provenance, release record, and manual-boundary confirmation | package root, `docs/` | v1.0.0 cutover ledger, Python-runtime rejection gate, validation evidence, and annotated Git tag implemented |
