# Pi iOS Implementation Plan

## Completion standard

Pi iOS is complete when it can take a trusted iOS repository through define, plan approval, isolated build, test, review, combined verification, ship approval, and a verified manual TestFlight handoff using its TypeScript safety kernel.

## Delivered capabilities

| Capability | Evidence |
| --- | --- |
| Deterministic lifecycle, worktrees, claims, leases, and recovery | hash-chained state, adversarial fault tests, and controlled writer sessions |
| Xcode/simulator verification | commit-bound builds, tests, xcresults, screenshots, and leases |
| Release readiness | privacy/monetization gates, approvals, local promotion, and manual handoff |
| Multi-agent delivery | immutable packets, bounded workers/repair, integration epochs, and combined verification |
| Specialist reasoning | bounded package-owned context selection and scenario evaluations |
| XCTest quality enforcement | fresh accessibility-audit and performance-metric evidence against project-owned budgets |
| Package identity | Pi-native TypeScript source under `extensions/pi-ios/` and local runtime under `.pi-ios/` |

## Ongoing standards

- Keep deterministic enforcement outside model prose.
- Keep all local runtime state ignored, permission-minimized, and outside product source.
- Keep package documentation current-state and user-oriented.
- Treat versioned durable state, privacy, signing, payment, and release changes as high risk.
- Keep Git push, App Store Connect upload, and tester distribution as explicit manual boundaries.

## Verification baseline

```bash
npm run check
PI_IOS_XCODE_E2E=1 npx tsx --test tests/xcode-e2e.test.ts tests/real-app-handoff-e2e.test.ts
pi -e . --list-models
npm pack --dry-run --json
git diff --check
npm audit --omit=dev
```
