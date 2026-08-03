---
name: canopy-build
description: Implement one approved indie Apple-platform vertical slice with Swift 6.2, SwiftUI, SwiftData, Swift Concurrency, and focused tests inside an authorized Canopy worktree.
compatibility: Canopy; iOS/macOS 26+, Swift 6.2+
---

# iOS Build

Implement one approved slice and produce commit-bound evidence.

## Workflow

1. Confirm acceptance criteria, risk, dependencies, and intended paths.
2. Obtain Canopy write preflight, isolated worktree, lease, and path claims before any mutation.
3. Read the narrow source and test neighborhood.
4. Implement the smallest complete vertical behavior; preserve Swift concurrency isolation and explicit state ownership.
5. Add focused tests when they provide a stable behavioral seam.
6. Call `canopy_verify`; use `matrix=true` when the approved slice names both platforms, accept the adaptive minimum profile, and preserve its verification fingerprint.
7. Call `canopy_session postflight` with evidence and that exact fingerprint. Finish only if source and artifacts remain unchanged, then call `canopy_lifecycle integrate` with the approved `sliceId`; the kernel must map claims to exactly one approved slice and emit the build-stage receipt.

## Specialist context

Before implementing a non-trivial surface, call `canopy_context` with `stage=build`, slice risk, task, and touched surfaces. Read returned references before editing: SwiftUI/layout/accessibility uses `swiftui-experience.md`; persistence/concurrency uses `swift-state.md`; user-facing language uses `product-interface.md`; paid behavior uses `monetization.md`; permissions/data use `privacy-security.md`. Convert applicable checks into code, tests, or evidence—never merely a prose claim.

## Guardrails

- Never write outside claimed paths.
- Never broaden SLC scope or refactor unrelated code.
- Never bypass a failing gate or describe unrun checks as passing.
- Stop for architecture, privacy, payment, signing, or destructive-data changes.

## Output

Report session, claims, implementation, changed files, tests, verification profile and fingerprint, artifact paths, documentation sync, risks, and integration state.
