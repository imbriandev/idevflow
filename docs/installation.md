# Installation and Upgrade

## Requirements

- Node.js 22 or newer
- Pi 0.82.1 or newer
- macOS with Xcode 26+ and Swift 6.2+; iOS verification additionally requires an iOS 26+ simulator runtime
- a Git repository with an explicit author identity for writer commits

## Local installation

```bash
cd /path/to/iOS-app
pi -e /path/to/Pi-ios
```

For package development:

```bash
cd /path/to/Pi-ios
npm ci
npm run check
pi -e . --list-models
```

Pi discovers the extension and seven `ios-*` skills from `package.json`. The package executes as TypeScript within Pi.

## First project initialization

In a trusted Git project, use `pi_ios_runtime` to initialize state. Pi iOS creates ignored local state under `.pi-ios/`; tracked product and plan documents are created only through the lifecycle tools.

Before a writer stage, the project must have a clean baseline and valid Git identity. Preflight creates a sibling isolated worktree, so the original checkout is not the writer's mutable directory.

## Platform selection

Config schema 6 defaults to iOS. For a macOS app, initialize/migrate the runtime, then set `xcode.platform` to `macos` in `.pi-ios/config.json`. macOS runs native `platform=macOS` build/test verification and does not acquire an iOS simulator. macOS release/notarization support is not part of M13a.

## Config migration

Configuration is versioned. `pi_ios_runtime` exposes migration discovery and application. Applying a migration:

1. validates the existing configuration object;
2. copies the old configuration to `.pi-ios/config.json.v<old>.backup`;
3. atomically writes the current schema;
4. never changes source, writer worktrees, packet files, receipts, or Git refs.

Review the migration plan before applying it. Unknown future schemas fail closed.

## Diagnostics and recovery

Use `pi_ios_context` before non-trivial SwiftUI, persistence, concurrency, testing, privacy, monetization, accessibility, performance, widget, App Intent, audit, or release reasoning. It returns readable package-owned reference paths within a bounded cold-path budget; read only the selected material. When an eligible writer session exists, it also records the required context receipt for high/critical verification or review; release verification requires a separate `stage=ship`, `risk=critical` receipt.

Release-quality verification defaults to `quality.requireXCTestEvidence=true`. Configure project-owned numeric budgets in `quality.performanceBudgets`, then provide source-bound proof metadata naming a passing XCTest accessibility-audit test and performance-metric test. Pi iOS parses the fresh release xcresult and rejects metadata-only evidence, missing named tests, missing XCTest APIs, absent measurements, or metric values over budget.

Use `pi_ios_doctor status` for human-readable findings or `pi_ios_doctor report` for a structured metadata-only support report. The report intentionally excludes source text, task text, worker packets, logs, approvals, and credentials.

`pi_ios_doctor repair` is interactive and only marks expired active writer sessions as stale. `pi_ios_pipeline reconcile` detects lost worker leases. Neither operation deletes branches, worktrees, packets, logs, or unintegrated source.

## Verification commands

```bash
npm run check
git diff --check
pi -e . --list-models
npm pack --dry-run --json
PI_IOS_XCODE_E2E=1 PI_MACOS_XCODE_E2E=1 npx tsx --test tests/xcode-e2e.test.ts tests/real-app-handoff-e2e.test.ts
```

The real Xcode E2E test is opt-in locally and required in the macOS CI workflow.
