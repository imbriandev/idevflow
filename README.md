# Pi iOS

Pi iOS is a Pi-native workflow for taking an indie iOS app from an idea to a commit-bound, verified TestFlight handoff.

The project is a ground-up TypeScript implementation. AppForge is a behavioral reference only; the finished package will not require its Python runtime.

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

The agent uses typed tools rather than ad-hoc shell mutation:

- `pi_ios_runtime` — status, initialize, or migrate local runtime state.
- `pi_ios_preflight` — authorize a stage, create a worktree, and claim paths.
- `pi_ios_session` — status, heartbeat, park/resume, verification-bound postflight, and finish.
- `pi_ios_exec` — run allowlisted Git, Swift, Xcode, and simulator commands in the writer worktree.
- `pi_ios_simulator` — lease, boot, inspect, release, and capture named screenshots.
- `pi_ios_proof` — prepare source-bound accessibility and performance evidence.
- `pi_ios_verify` — run adaptive build/test verification and emit a fingerprinted receipt.
- `pi_ios_doctor` — diagnose or conservatively repair stale registry state.

During an active stage, direct writes are blocked until preflight and restricted to claimed paths. Mutating Bash is blocked; managed execution is routed through `pi_ios_exec`.

## Development

```bash
npm install
npm run check
pi -e .
```

## Documentation

- [Architecture](docs/architecture/overview.md)
- [Runtime state model](docs/architecture/state-model.md)
- [Rewrite parity matrix](docs/plans/parity-matrix.md)
- [Implementation plan](docs/plans/implementation-plan.md)
- [Milestone 3 safety-kernel execution](docs/plans/milestone-3-safety-kernel.md)
- [Milestone 4 Xcode verification](docs/plans/milestone-4-xcode-verification.md)
- [Security notes](docs/security.md)
- [ADR-0001: Pi-native TypeScript kernel](docs/decisions/0001-pi-native-typescript-kernel.md)
