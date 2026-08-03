# Milestone 4 — Xcode Verification Harness

## Status

Complete.

## Delivered capabilities

### Project and toolchain discovery

- Discovers one configured or unambiguous `.xcworkspace`, `.xcodeproj`, or Swift package.
- Ignores internal project workspaces and generated dependency/resource directories.
- Resolves shared schemes through `xcodebuild -list -json`.
- Resolves build settings, deployment target, Swift language mode, and bundle identifier.
- Enforces Xcode 26+, Swift 6.2+, and iOS deployment target 26+ for app projects.
- Fails closed on ambiguous containers or schemes.

### Process supervision

- Uses argument-array process spawning without a shell.
- Uses allowlisted environment variables, explicit cwd, timeout, cancellation, and process-group termination.
- Streams redacted stdout/stderr into mode-0600 artifact logs.
- Keeps bounded diagnostic tails while preserving complete redacted logs.
- Removes an artifact bundle and fails closed if a secret scan finds credentials in generated evidence.

### Simulator isolation

- Discovers available iPhone simulators from `simctl` JSON.
- Selects the newest runtime or configured name/destination UDID.
- Serializes exclusive leases across Pi writer sessions.
- Boots and waits for readiness, releases leases, and optionally shuts down devices started by the harness.
- Captures named PNG screenshot evidence with source-bound metadata.

### Adaptive verification

| Profile | App actions | Swift package actions | Required quality proof |
| --- | --- | --- | --- |
| `docs` | structural diff check | structural diff check | none |
| `quick` | build | build | none |
| `slice` | build | build + test | none |
| `integration` | build + test | build + test | simulator for app projects |
| `release` | build + test | build + test | simulator, required screenshot variants, accessibility, performance |

The kernel prevents callers from selecting a profile weaker than stage, risk, and changed-file policy requires.

### Evidence and receipts

- Isolates DerivedData and Swift scratch resources by writer session.
- Emits xcresult bundles for Xcode actions.
- Parses test-result summaries and rejects zero-test or failing integration evidence.
- Hashes files and directory artifacts deterministically.
- Binds receipts to source, dirty content, config, project, toolchain, destination, profile, and external proof content.
- Reuses only exact, successful, unexpired, untampered non-release receipts.
- Never reuses release verification.
- Requires a valid verification fingerprint before postflight can pass.
- Rejects source changes after verification.
- Prunes expired verification artifact directories according to config while preserving the current run.

### Quality proof preparation

- `canopy_simulator screenshot` captures source-bound screenshot proof.
- `canopy_proof` prepares source-bound accessibility or performance metadata.
- Accessibility evidence requires passing named tests.
- Performance evidence requires finite metrics and budgets.
- Release evidence requires `compact-light`, `compact-dark`, and `accessibility-xxxl` screenshots by default.

## Verification evidence

Automated suite:

```text
51 tests
50 normal-pass
1 Xcode E2E skipped unless CANOPY_IOS_XCODE_E2E=1
```

Real Xcode E2E:

```text
CANOPY_IOS_XCODE_E2E=1 npx tsx --test tests/xcode-e2e.test.ts
pass
```

The real fixture:

- builds an iOS 26 SwiftUI app
- runs a Swift Testing test target on an exclusive iPhone simulator
- emits and validates build/test xcresult bundles
- parses one passing test from `xcresulttool`
- records simulator evidence
- reuses the exact untampered integration receipt
- binds postflight to the receipt
- commits the verified source in the writer worktree
