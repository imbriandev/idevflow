---
name: ios-test
description: Reproduce, diagnose, minimally repair, and prove broken, flaky, uncertain, or unverified iOS behavior using Swift Testing, XCTest, simulator evidence, and Pi iOS verification receipts.
compatibility: Pi iOS; iOS 26+, Swift 6.2+
---

# iOS Test

Turn uncertainty into reproducible evidence.

## Workflow

1. State expected behavior, observed behavior, environment, and reproduction path.
2. Reproduce before changing code; if reproduction fails, record what remains unknown.
3. Isolate the smallest root cause using focused diagnostics.
4. Obtain write authorization before adding tests or fixes.
5. Add the narrowest stable regression proof and repair the verified cause.
6. Re-run focused checks, then the risk-selected integration surface.
7. Store xcresult, simulator, screenshot, accessibility, or performance artifacts when required.

## Guardrails

- No speculative fix before reproduction or bounded diagnosis.
- No-repro is not a pass.
- Do not erase flaky evidence with retries alone.
- Do not weaken tests to make a build green.

## Output

Report reproduction, root cause, repair, regression coverage, commands and receipts, artifacts, remaining uncertainty, and next route.
