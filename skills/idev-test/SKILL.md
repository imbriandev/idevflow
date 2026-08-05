---
name: idev-test
description: Reproduce, diagnose, minimally repair, and prove broken, flaky, uncertain, or unverified Apple-platform behavior using Swift Testing, XCTest, simulator evidence, and iDevFlow verification receipts.
compatibility: iDevFlow; iOS/macOS 26+, Swift 6.2+
---

# Apple-platform Test

Turn uncertainty into reproducible evidence.

## Workflow

1. State expected behavior, observed behavior, environment, and reproduction path.
2. Reproduce before changing code; if reproduction fails, record what remains unknown.
3. Isolate the smallest root cause using focused diagnostics.
4. Obtain write authorization before adding tests or fixes.
5. Add the narrowest stable regression proof and repair the verified cause.
6. Re-run focused checks through `idev_verify`; do not request a profile weaker than policy selects.
7. Inspect xcresult summaries and provide source-bound simulator, screenshot, accessibility, or performance proof when required. Pass the fingerprint to postflight, finish, and call `idev_lifecycle integrate` to produce the test-stage receipt.

## Specialist context

Call `idev_context` with `stage=test` and the reproduction surface before choosing a repair. Read `testing-quality.md` for every regression/flaky claim; additionally load SwiftUI, state/concurrency, privacy, or monetization guidance only when the failure touches it. Primary-flow, accessibility, or performance claims require the corresponding source-bound artifacts, not a successful build alone. For macOS, use the native destination and include keyboard, menu, window, sandbox, or file-access behavior when relevant.

## Guardrails

- No speculative fix before reproduction or bounded diagnosis.
- No-repro is not a pass.
- Do not erase flaky evidence with retries alone.
- Do not weaken tests to make a build green.

## Output

Report reproduction, root cause, repair, regression coverage, commands and receipts, artifacts, remaining uncertainty, and next route.
