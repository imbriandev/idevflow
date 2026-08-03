# iDevFlow

iDevFlow is a TypeScript Pi package for taking an indie Apple-platform app from idea through authorized implementation and commit-bound verification. It supports iOS, macOS, and exact-commit universal verification matrices, with separate manual TestFlight and macOS distribution handoffs.

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
- iOS 26 or macOS 26 or newer
- Swift 6.2 or newer
- SwiftUI, SwiftData, Swift Concurrency, and Swift Testing

## Conversational coordinator

Use iDevFlow conversationally: describe the product, the next change, a defect, or a beta decision. At each interaction boundary, the coordinator reads the durable `.idevflow/` state and injects a safe next-route brief for the agent. `/idev` provides the corresponding dashboard for workflow, runtime, baseline, active writer, pipeline, and recovery status.

The coordinator does not own authority: lifecycle transitions, founder approvals, worktree writes, integration, promotion, push, upload, and distribution remain kernel-gated operations. It also does not run in the background; it resumes solely from durable state on the next Pi interaction.

The seven lifecycle commands remain optional manual escape hatches:

```text
/idev:define  /idev:plan  /idev:build  /idev:test
/idev:review  /idev:ship  /idev:learn
```

## Safety-kernel tools

- `idev_runtime` — inspect, initialize, or migrate versioned local runtime state under `.idevflow/`.
- `idev_context` — select bounded specialist iOS references and record required session-bound context receipts.
- `idev_lifecycle` — integrate stages, approve frozen plans, and record source-bound reviews.
- `idev_release` — create, approve, locally promote, and hand off exact TestFlight candidates.
- `idev_pipeline` — create, schedule, reconcile, observe, and integrate frozen multi-agent work graphs.
- `idev_pipeline_worker` — capability-bound worker repair and source-bound submission.
- `idev_preflight` / `idev_session` — authorize writer worktrees, claims, postflight, and completion.
- `idev_exec` / `idev_verify` — run managed verification and emit fingerprinted receipts.
- `idev_simulator` / `idev_proof` — capture simulator and XCTest-backed quality evidence.
- `idev_doctor` — diagnose and conservatively repair local runtime state.

Push, App Store Connect upload, and tester distribution remain explicit manual boundaries.

## Installation

```bash
pi install npm:idevflow@beta
```

Then open a trusted Apple-platform Git project and run `/idev` or describe the product/change conversationally. Start with [Getting started](docs/getting-started.md).

## Development

```bash
npm install
npm run check
pi -e .
```

## Documentation

### Use iDevFlow

- [Getting started](docs/getting-started.md)
- [Core concepts](docs/concepts.md)
- [Workflow](docs/workflow.md)
- [Commands and tools](docs/commands.md)
- [Configuration](docs/configuration.md)
- [Migration](docs/migration.md)
- [Verification](docs/verification.md)
- [Troubleshooting](docs/troubleshooting.md)

### Maintainers and internals

- [Architecture](docs/architecture/overview.md)
- [Runtime state model](docs/architecture/state-model.md)
- [Security notes](docs/security.md)
- [Release process](docs/release-process.md)
- [Local-project install playbook](docs/local-project-install-playbook.md)
- [Operations playbook](docs/operations-playbook.md)
- [Capability matrix](docs/plans/parity-matrix.md)
- [macOS release template](templates/macos-release.json)
