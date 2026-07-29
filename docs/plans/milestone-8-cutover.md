# Milestone 8 — Stable Cutover

## Result

Pi iOS v1.0.0 is cut over as the first stable Pi-native TypeScript package release. The stable record is an annotated Git tag, not an automatic npm publication and not an iOS distribution action.

## Parity and provenance

The full [parity matrix](parity-matrix.md) was reviewed. Safety-critical behavior is implemented in the deterministic extension kernel: state, worktree isolation, claims, leases, receipts, verification, approvals, integration, release gates, recovery, and multi-agent coordination do not rely on model prose.

`tests/cutover.test.ts` recursively scans package runtime source, skills, and package manifest/scripts. It fails if Python/Pip invocation, `.py` runtime reference, or `iosflow_runtime` AppForge module reference is introduced. The package contains no Python runtime dependency or invocation.

## Real app workflow proof

The opt-in `tests/real-app-handoff-e2e.test.ts` runs the tracked Xcode 26 SampleApp through:

1. a real Xcode integration build/test verification;
2. source-bound simulator screenshots and release proof inputs;
3. a fresh real Xcode Release build/test verification with xcresults and parsed summary;
4. review receipt, exact release candidate creation, candidate-bound approval, and local fast-forward promotion;
5. a recorded manual TestFlight handoff with push/archive/upload/distribution all false.

The test uses an isolated temporary Git repository and simulator lease. It does not access App Store Connect or a remote Git host. This proves the intended verified handoff boundary without pretending to upload a test fixture.

`tests/xcode-e2e.test.ts` separately proves exact non-release receipt reuse on a real simulator. Both run in the macOS CI workflow when `PI_IOS_XCODE_E2E=1`.

## Stable gates

The v1.0.0 cutover passed:

- `npm run check`
- real Xcode verification and real SampleApp manual-handoff E2E
- Pi extension loading (`pi -e . --list-models`)
- package dry-run (`npm pack --dry-run --json`)
- production dependency audit (`npm audit --omit=dev`)
- `git diff --check`

The development-only advisory documented in `docs/security.md` remains explicitly tracked. The reference-only AppForge repository was not modified.

## Follow-up boundary

Registry publication requires an intentional future decision to remove `private` and use approved credentials. App Store Connect upload/distribution likewise remains a separate explicitly approved capability. Neither is part of this stable Git cutover.
