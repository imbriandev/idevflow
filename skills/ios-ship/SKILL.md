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
3. Prepare source-bound screenshot variants with `pi_ios_simulator`, accessibility/performance metadata with `pi_ios_proof`, then run fresh `pi_ios_verify` using the non-reusable `release` profile.
4. Validate the configured privacy-review and release-manifest JSON. If StoreKit or RevenueCat is detected, require the reconciled monetization manifest and complete proof set.
5. Call `pi_ios_release create_candidate` with the fresh release fingerprint. Present the exact candidate, target, gates, and known issues.
6. Call `pi_ios_release approve` only when the founder is ready; use its expiring single-use token for exact local `promote`.
7. Call `handoff` to emit the verified manual package. Push, upload, and tester distribution remain unperformed, separate approvals.

## Specialist context

Call `pi_ios_context` with `stage=ship`, `risk=critical`, and candidate surfaces before Go/No-Go. Read `release-testflight.md` and every returned privacy/monetization/testing reference. The reference improves review quality; the release tool and fresh receipt remain the only authority for candidate, approval, promotion, and handoff.

## Guardrails

- Never promote a different commit than the approved candidate.
- Never convert privacy or payment blockers into minor known issues.
- Never imply that approval uploaded or distributed a build.

## Output

Report candidate, target, release verification fingerprint, xcresult and proof manifest, privacy and monetization status, blockers, known issues, Go/No-Go, approvals, and handoff steps.
