# Troubleshooting

## iDevFlow does not load

Check the package and extension directly:

```bash
npx pi -e . --list-models
npm run check
```

For a registry installation, reinstall the package and restart Pi:

```bash
pi remove npm:idevflow
pi install npm:idevflow@beta
```

## Runtime directory conflict

If initialization refuses to proceed, inspect the hidden runtime directories described in [Migration](migration.md). iDevFlow fails closed when multiple candidates exist. Back up the directories, decide which state is authoritative, and remove or restore only after inspection.

## Dirty baseline

Writer preflight requires a clean baseline. Commit or stash unrelated changes in the trusted checkout, then retry. Do not force a writer into a dirty checkout.

## Writer or lease recovery

Use:

```text
idev_runtime status
idev_doctor status
idev_doctor repair
```

Repair only marks expired sessions stale. It does not delete source. Inspect the preserved sibling worktree and branch before retrying.

## Verification cannot find a destination

Confirm Xcode and simulator runtimes:

```bash
xcodebuild -version
xcrun simctl list devices available
```

For macOS projects, set `requiredPlatforms` to `macos`; for universal projects, include both `ios` and `macos`.

## Receipt is stale

A receipt is source-bound. Any commit, changed file, configuration change, toolchain change, destination change, or missing artifact can invalidate it. Re-run the required verification profile rather than editing receipt metadata.

## Release candidate is blocked

Inspect the structured gates with `idev_release` and review `idev_doctor report`. Common causes are missing fresh XCTest evidence, source-bound proof mismatch, privacy or monetization gaps, missing required platform evidence, or an unapproved candidate.

## Support report

`idev_doctor report` is safe to attach to a support request. It contains metadata and recommendations, not source text, task text, logs, packets, approvals, or credentials.
