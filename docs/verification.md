# Verification

Verification is managed by iDevFlow and produces source-bound receipts. The required profile depends on the lifecycle stage, risk, changed paths, and target platforms.

## Local gates

From the iDevFlow repository:

```bash
npm ci
npm run check
git diff --check
npx pi -e . --list-models
npm pack --dry-run --json
```

Real Xcode E2E is opt-in locally:

```bash
IDEVFLOW_IOS_XCODE_E2E=1 \
IDEVFLOW_MACOS_XCODE_E2E=1 \
IDEVFLOW_UNIVERSAL_XCODE_E2E=1 \
npx tsx --test tests/xcode-e2e.test.ts

IDEVFLOW_IOS_XCODE_E2E=1 \
npx tsx --test tests/real-app-handoff-e2e.test.ts
```

## Platform behavior

- iOS discovers a simulator destination, acquires an exclusive lease, and runs build/test against isolated DerivedData.
- macOS runs native `platform=macOS` verification without an iOS simulator.
- Universal projects run both required platforms and emit a matrix receipt.

A matrix fails if either required platform is missing, stale, or bound to a different source fingerprint.

## Evidence requirements

Receipts bind:

- source commit and dirty-content fingerprint;
- project, scheme, configuration, and platform;
- Xcode and Swift toolchain;
- destination and verification profile;
- proof files and artifact hashes.

For release-quality checks, XCTest evidence is required by default. Named accessibility and performance tests must pass in the fresh xcresult, use the expected XCTest APIs, and contain measurements within configured budgets. Metadata-only claims are rejected.

## Artifacts and failures

Managed processes use fixed executable policy, timeouts, cancellation, bounded output, and redaction. xcresult bundles and logs are scanned for credential-shaped content. Contaminated artifacts do not produce a successful receipt.

When verification fails, keep the receipt and artifacts for diagnosis. Do not claim success from a partial log or delete the failing worktree.

## Receipt reuse

Non-release receipts may be reused only while their source fingerprint and artifacts remain intact. Release verification is always fresh. Any source drift invalidates the receipt.
