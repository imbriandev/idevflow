# Canopy

Canopy is a TypeScript Pi package for taking an indie Apple-platform app from idea through authorized implementation and commit-bound verification. It supports iOS, macOS, and exact-commit universal verification matrices, with separate manual TestFlight and macOS distribution handoffs.

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

Use Canopy conversationally: describe the product, the next change, a defect, or a beta decision. At each interaction boundary, the coordinator reads the durable `.canopy/` state and injects a safe next-route brief for the agent. `/canopy` provides the corresponding dashboard for workflow, runtime, baseline, active writer, pipeline, and recovery status.

The coordinator does not own authority: lifecycle transitions, founder approvals, worktree writes, integration, promotion, push, upload, and distribution remain kernel-gated operations. It also does not run in the background; it resumes solely from durable state on the next Pi interaction.

The seven lifecycle commands remain optional manual escape hatches:

```text
/canopy:define  /canopy:plan  /canopy:build  /canopy:test
/canopy:review  /canopy:ship  /canopy:learn
```

## Safety-kernel tools

- `canopy_runtime` — inspect, initialize, or migrate versioned local runtime state under `.canopy/`.
- `canopy_context` — select bounded specialist iOS references and record required session-bound context receipts.
- `canopy_lifecycle` — integrate stages, approve frozen plans, and record source-bound reviews.
- `canopy_release` — create, approve, locally promote, and hand off exact TestFlight candidates.
- `canopy_pipeline` — create, schedule, reconcile, observe, and integrate frozen multi-agent work graphs.
- `canopy_pipeline_worker` — capability-bound worker repair and source-bound submission.
- `canopy_preflight` / `canopy_session` — authorize writer worktrees, claims, postflight, and completion.
- `canopy_exec` / `canopy_verify` — run managed verification and emit fingerprinted receipts.
- `canopy_simulator` / `canopy_proof` — capture simulator and XCTest-backed quality evidence.
- `canopy_doctor` — diagnose and conservatively repair local runtime state.

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
- [Cài Canopy theo từng project](docs/local-project-install-playbook.md)
- [Coordinator-first operations playbook](docs/operations-playbook.md)
- [Release process](docs/release-process.md)
- [Context and XCTest evidence enforcement](docs/plans/milestone-10-evidence-enforcement.md)
- [Idea Quality Gate](docs/plans/milestone-12-idea-quality.md)
- [macOS support](docs/plans/milestone-13-macos-support.md)
- [macOS release template](templates/macos-release.json)
