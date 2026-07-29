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

The extension also provides `/ios` for current workflow status.

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
- [ADR-0001: Pi-native TypeScript kernel](docs/decisions/0001-pi-native-typescript-kernel.md)
