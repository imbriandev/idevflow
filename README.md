# Pi iOS

Pi iOS is a TypeScript Pi package for taking an indie iOS app from idea to a commit-bound, verified TestFlight handoff. Its deterministic kernel owns lifecycle state, source authorization, verification, approvals, integration, and release boundaries.

## Product principles

- Founder decisions remain explicit.
- Workflow state is deterministic, not inferred from agent prose.
- Every write is stage-, worktree-, and path-authorized.
- Evidence is bound to source commit, configuration, toolchain, and destination.
- Release promotion and distribution require separate approvals.
- Skills provide iOS expertise; the extension kernel owns safety and lifecycle state.

## Target baseline

- Pi `0.82.1` or newer
- macOS with Xcode
- iOS 26 or newer
- Swift 6.2 or newer
- SwiftUI, SwiftData, Swift Concurrency, and Swift Testing

## Lifecycle commands

```text
/ios:define
/ios:plan
/ios:build
/ios:test
/ios:review
/ios:ship
/ios:learn
```

The extension also provides `/ios` for current workflow, runtime, baseline, and writer status.

## Safety-kernel tools

- `pi_ios_runtime` — inspect, initialize, or migrate versioned local runtime state under `.pi-ios/`.
- `pi_ios_context` — select bounded specialist iOS references and record required session-bound context receipts.
- `pi_ios_lifecycle` — integrate stages, approve frozen plans, and record source-bound reviews.
- `pi_ios_release` — create, approve, locally promote, and hand off exact TestFlight candidates.
- `pi_ios_pipeline` — create, schedule, reconcile, observe, and integrate frozen multi-agent work graphs.
- `pi_ios_pipeline_worker` — capability-bound worker repair and source-bound submission.
- `pi_ios_preflight` / `pi_ios_session` — authorize writer worktrees, claims, postflight, and completion.
- `pi_ios_exec` / `pi_ios_verify` — run managed verification and emit fingerprinted receipts.
- `pi_ios_simulator` / `pi_ios_proof` — capture simulator and XCTest-backed quality evidence.
- `pi_ios_doctor` — diagnose and conservatively repair local runtime state.

Push, App Store Connect upload, and tester distribution remain explicit manual boundaries.

## Development

```bash
npm install
npm run check
pi -e .
```

## Documentation

- [Architecture](docs/architecture/overview.md)
- [Runtime state model](docs/architecture/state-model.md)
- [Current capability matrix](docs/plans/parity-matrix.md)
- [Implementation plan](docs/plans/implementation-plan.md)
- [Clean-break namespace migration](docs/plans/milestone-11-clean-break.md)
- [Security notes](docs/security.md)
- [Installation and upgrade](docs/installation.md)
- [Release process](docs/release-process.md)
- [Context and XCTest evidence enforcement](docs/plans/milestone-10-evidence-enforcement.md)
