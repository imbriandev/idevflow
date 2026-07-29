# Stable Cutover — v1.0.0

## Scope

Pi iOS v1.0.0 is the first stable, Pi-native TypeScript release for a trusted indie iOS repository. It covers idea definition, frozen planning, isolated single- and multi-agent implementation, commit-bound Xcode verification, review, candidate promotion, and a verified **manual** TestFlight handoff.

This cutover replaces no external service and does not migrate AppForge runtime state. AppForge remains a behavioral reference only; Pi iOS does not invoke, bundle, import, or require its Python runtime.

## Parity decision

The [parity matrix](plans/parity-matrix.md) was reviewed at cutover. All safety-critical lifecycle, source ownership, verification, approval, integration, release, recovery, and pipeline requirements are implemented and covered by tests.

The original v1.0.0 cutover intentionally separated specialist reasoning from the stable safety contract. v1.1.0 closes that gap with package-owned specialist cold references, deterministic stage/risk/surface selection, bounded context budgets, worker access, and domain scenario evaluations. Aggregate telemetry export remains intentionally out of scope; any future optional analytics must remain local, redacted, and unable to advance lifecycle state.

## Evidence run for this cutover

Run from a clean checkout on supported macOS/Xcode:

```bash
npm ci
npm run check
PI_IOS_XCODE_E2E=1 npx tsx --test tests/xcode-e2e.test.ts tests/real-app-handoff-e2e.test.ts
pi -e . --list-models
npm pack --dry-run --json
git diff --check
npm audit --omit=dev
```

The suite includes a complete deterministic lifecycle handoff (`tests/full-lifecycle.test.ts`), concurrent isolated-worker integration (`tests/multi-agent-pipeline.test.ts`), recovery/fault tests, mock-agent authority tests, and real Xcode 26 SampleApp simulator verification. `tests/real-app-handoff-e2e.test.ts` additionally performs real integration/release Xcode verification, creates the candidate, locally promotes it, and writes the explicit no-upload manual handoff. These tests produce real build/test xcresults and simulator proof. CI runs the same unit/package gates and both opt-in Xcode E2Es on macOS.

`tests/cutover.test.ts` statically rejects Python/Pip invocation, `.py` runtime references, and AppForge runtime module references from package runtime files and package scripts.

## Manual TestFlight boundary

A successful handoff is not an upload. `pi_ios_release` requires fresh release verification, source-bound proof, review, privacy/monetization metadata, candidate-bound approval, and local promotion. It then writes a handoff package for a founder to perform the next manual steps.

This release deliberately does **not** push Git, archive/export an IPA, authenticate to App Store Connect, upload a build, or distribute to testers. Each would need a future explicit capability and approval boundary.

## Release procedure

1. Run the evidence commands above and review the diagnostic report if needed.
2. Confirm `git status --short` is empty and review `docs/security.md` for the known development-only advisory.
3. Set the stable package version to `1.0.0`; validate the package contents.
4. Commit the cutover ledger and create annotated tag `v1.0.0` at that commit.
5. Publish only through an approved registry process after removing `private` intentionally, if registry distribution is desired. The Git tag is the stable release record; no package publication occurs automatically.
