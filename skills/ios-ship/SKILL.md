---
name: ios-ship
description: Evaluate an exact iOS candidate for privacy, signing, StoreKit when relevant, artifact-backed release verification, promotion approval, and a safe manual TestFlight handoff.
compatibility: Pi iOS; macOS/Xcode; iOS 26+, Swift 6.2+
---

# iOS Ship

Make a commit-bound Go/No-Go decision and prepare a deliberate TestFlight handoff.

## Workflow

1. Resolve the exact candidate commit, target, graph revision, and prior review verdict.
2. Reject stale candidates or evidence whose source/config/toolchain fingerprint differs.
3. Run fresh release verification and validate required xcresult, simulator, screenshot, accessibility, and performance proof.
4. Review privacy manifests, permissions, entitlements, data handling, signing, versioning, and known issues.
5. For paid apps, prove purchase, cancel, pending, restore, expiration, offline entitlement, and disclosure behavior.
6. Present Go/No-Go with accepted risks and request a candidate-bound promotion approval.
7. Treat push, upload, and tester distribution as separate approvals. Default to manual Xcode Organizer/App Store Connect handoff.

## Guardrails

- Never promote a different commit than the approved candidate.
- Never convert privacy or payment blockers into minor known issues.
- Never imply that approval uploaded or distributed a build.

## Output

Report candidate, target, evidence manifest, privacy and monetization status, blockers, known issues, Go/No-Go, approvals, and handoff steps.
