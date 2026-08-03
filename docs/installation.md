# Installation and Upgrade

## Requirements

- Node.js 22 or newer
- Pi 0.82.1 or newer
- macOS with Xcode 26+ and Swift 6.2+; iOS verification additionally requires an iOS 26+ simulator runtime
- a Git repository with an explicit author identity for writer commits

## Local installation

```bash
cd /path/to/iOS-app
pi -e /path/to/Canopy
```

For package development:

```bash
cd /path/to/Canopy
npm ci
npm run check
pi -e . --list-models
```

Pi discovers the extension and seven `canopy-*` skills from `package.json`. The package executes as TypeScript within Pi.

## First project initialization

In a trusted Git project, use `canopy_runtime` to initialize state. Canopy creates ignored local state under `.canopy/`; tracked product and plan documents are created only through the lifecycle tools.

Before a writer stage, the project must have a clean baseline and valid Git identity. Preflight creates a sibling isolated worktree, so the original checkout is not the writer's mutable directory.

## Platform selection

Config schema 7 defaults to iOS with `xcode.requiredPlatforms=["ios"]`. For a macOS app, set `xcode.platform` to `macos` and `requiredPlatforms` to `["macos"]`. For a universal app, set `requiredPlatforms` to `["ios", "macos"]` and run `canopy_verify` with `matrix=true`. macOS runs native `platform=macOS` build/test verification and does not acquire an iOS simulator. For M13b distribution readiness, use the macOS release manifest template and the `mac_handoff` release tool action; all signing, archive, notarization, upload, and distribution steps remain manual.

## Upgrade from the previous beta namespace

On first use, Canopy atomically renames an existing `.pi-ios/` runtime directory to `.canopy/`. It refuses symbolic links and fails closed if both directories exist, preserving all journals, receipts, packets, and approvals. The retired commands and tools are not aliased; update project instructions to `/canopy:*` and `canopy_*`.

## Config migration

Configuration is versioned. `canopy_runtime` exposes migration discovery and application. Applying a migration:

1. validates the existing configuration object;
2. copies the old configuration to `.canopy/config.json.v<old>.backup`;
3. atomically writes the current schema;
4. never changes source, writer worktrees, packet files, receipts, or Git refs.

Review the migration plan before applying it. Unknown future schemas fail closed.

## Diagnostics and recovery

Use `canopy_context` before non-trivial SwiftUI, persistence, concurrency, testing, privacy, monetization, accessibility, performance, widget, App Intent, audit, or release reasoning. It returns readable package-owned reference paths within a bounded cold-path budget; read only the selected material. When an eligible writer session exists, it also records the required context receipt for high/critical verification or review; release verification requires a separate `stage=ship`, `risk=critical` receipt.

Release-quality verification defaults to `quality.requireXCTestEvidence=true`. Configure project-owned numeric budgets in `quality.performanceBudgets`, then provide source-bound proof metadata naming a passing XCTest accessibility-audit test and performance-metric test. Canopy parses the fresh release xcresult and rejects metadata-only evidence, missing named tests, missing XCTest APIs, absent measurements, or metric values over budget.

Use `canopy_doctor status` for human-readable findings or `canopy_doctor report` for a structured metadata-only support report. The report intentionally excludes source text, task text, worker packets, logs, approvals, and credentials.

`canopy_doctor repair` is interactive and only marks expired active writer sessions as stale. `canopy_pipeline reconcile` detects lost worker leases. Neither operation deletes branches, worktrees, packets, logs, or unintegrated source.

## Verification commands

```bash
npm run check
git diff --check
pi -e . --list-models
npm pack --dry-run --json
CANOPY_IOS_XCODE_E2E=1 CANOPY_MACOS_XCODE_E2E=1 CANOPY_UNIVERSAL_XCODE_E2E=1 npx tsx --test tests/xcode-e2e.test.ts tests/real-app-handoff-e2e.test.ts
```

The real Xcode E2E test is opt-in locally and required in the macOS CI workflow.
