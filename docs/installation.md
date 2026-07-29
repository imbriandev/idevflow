# Installation and Upgrade

## Requirements

- Node.js 22 or newer
- Pi 0.82.1 or newer
- macOS with Xcode 26+, Swift 6.2+, and iOS 26+ simulator runtime for app verification
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

Pi discovers the extension and seven `ios-*` skills from `package.json`. The extension does not invoke or install AppForge's Python runtime.

## First project initialization

In a trusted Git project, use `pi_ios_runtime` to initialize state. Pi iOS creates ignored local state under `.appforge/`; tracked product and plan documents are created only through the lifecycle tools.

Before a writer stage, the project must have a clean baseline and valid Git identity. Preflight creates a sibling isolated worktree, so the original checkout is not the writer's mutable directory.

## Config migration

Configuration is versioned. `pi_ios_runtime` exposes migration discovery and application. Applying a migration:

1. validates the legacy object;
2. copies the old configuration to `.appforge/config.json.v<old>.backup`;
3. atomically writes the current schema;
4. never changes source, writer worktrees, packet files, receipts, or Git refs.

Review the migration plan before applying it. Unknown future schemas fail closed.

## Diagnostics and recovery

Use `pi_ios_doctor status` for human-readable findings or `pi_ios_doctor report` for a structured metadata-only support report. The report intentionally excludes source text, task text, worker packets, logs, approvals, and credentials.

`pi_ios_doctor repair` is interactive and only marks expired active writer sessions as stale. `pi_ios_pipeline reconcile` detects lost worker leases. Neither operation deletes branches, worktrees, packets, logs, or unintegrated source.

## Verification commands

```bash
npm run check
git diff --check
pi -e . --list-models
npm pack --dry-run --json
PI_IOS_XCODE_E2E=1 npx tsx --test tests/xcode-e2e.test.ts
```

The real Xcode E2E test is opt-in locally and required in the macOS CI workflow.
