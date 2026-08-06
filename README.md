# iDevFlow

iDevFlow is a TypeScript Pi package for taking an indie Apple-platform app from idea through authorized implementation, commit-bound verification, and founder-approved internal TestFlight upload. It supports iOS first, with macOS verification and distribution readiness.

## Product principles

- Founder decisions remain explicit.
- Workflow state is deterministic, not inferred from agent prose.
- Every write is stage-, worktree-, and path-authorized.
- Evidence is bound to source commit, configuration, toolchain, and destination.
- Release promotion and distribution require separate approvals.
- Skills provide Apple-platform expertise; the extension kernel owns safety and lifecycle state.

## Target baseline

- Pi `0.82.1` or newer
- macOS with Xcode
- iOS 26 or macOS 26 or newer
- Swift 6.2 or newer
- SwiftUI, SwiftData, Swift Concurrency, and Swift Testing

## Conversational coordinator

Use iDevFlow conversationally: describe the product, the next change, a defect, or a beta decision. Ask “what is blocking this beta?” for one plain-language readiness check; `idev_flow` combines routine local recovery, signing, candidate, and available App Store Connect status without exposing workflow mechanics. `/idev` remains an optional dashboard for technical detail.

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
- `idev_apple` — internal Apple capability: audit/signing, App Store Connect status, founder-approved provisioning/archive/upload, and later confirmed remote reconciliation; it never selects testers or distributes.
- `idev_preflight` / `idev_session` — authorize writer worktrees, claims, postflight, and completion.
- `idev_exec` / `idev_verify` — run managed verification and emit fingerprinted receipts.
- `idev_simulator` / `idev_proof` — capture simulator and XCTest-backed quality evidence.
- `idev_doctor` — diagnose and conservatively repair local runtime state.

Promotion, IPA export/upload, tester selection, and distribution remain explicit founder boundaries. App Store Connect credentials are injected only into the approved Automic Vault child process for status and upload; they never enter iDevFlow state, receipts, prompts, or source. See the [Apple release capability matrix](docs/release-capabilities.md).

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
- [Apple release capability matrix](docs/release-capabilities.md)
- [Local-project install playbook](docs/local-project-install-playbook.md)
- [Operations playbook](docs/operations-playbook.md)
- [Capability matrix](docs/plans/parity-matrix.md)
- [macOS release template](templates/macos-release.json)
