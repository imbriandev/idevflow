# Release Process

## Scope

A package release publishes Canopy tooling. It is distinct from an iOS app release and never grants push, archive/upload, App Store Connect, or tester-distribution authority.

## Maintainer checklist

1. Start from a clean `main` checkout.
2. Run `npm ci && npm run check`.
3. Run `CANOPY_IOS_XCODE_E2E=1 npx tsx --test tests/xcode-e2e.test.ts` on a supported macOS/Xcode installation.
4. Run `pi -e . --list-models`, `npm pack --dry-run --json`, and `git diff --check`.
5. Review `npm audit`; document any unavoidable transitive advisory in `docs/security.md`.
6. Verify config migrations from every previously supported schema and verify `canopy_doctor report` contains no source/task/credential data.
7. Update the package version and changelog/release notes, commit, tag, and publish through the approved registry process.

## iOS app handoff reminder

For an app candidate, `canopy_release promote` changes only the local base branch after a candidate-bound approval. The manual TestFlight handoff package records the exact evidence and explicit next actions. Push, archive/export, App Store Connect upload, and tester distribution are separate operations requiring their own future approvals.
