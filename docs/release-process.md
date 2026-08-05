# Release Process

## Scope

A package release publishes iDevFlow tooling. It is distinct from an iOS app release and never grants push, archive/upload, App Store Connect, or tester-distribution authority.

## Maintainer checklist

1. Start from a clean `main` checkout.
2. Run `npm ci && npm run check`.
3. Run `IDEVFLOW_IOS_XCODE_E2E=1 IDEVFLOW_MACOS_XCODE_E2E=1 IDEVFLOW_UNIVERSAL_XCODE_E2E=1 npx tsx --test tests/xcode-e2e.test.ts`, then `IDEVFLOW_IOS_XCODE_E2E=1 npx tsx --test tests/real-app-handoff-e2e.test.ts`, on a supported macOS/Xcode installation.
4. Run `npx pi -e . --list-models`, `npm pack --dry-run --json`, and `git diff --check`.
5. Review `npm audit`; document any unavoidable transitive advisory in `docs/security.md`.
6. Verify config migrations from every previously supported schema and verify `idev_doctor report` contains no source/task/credential data.
7. Update the package version and changelog/release notes, then commit and push the release preparation change.
8. Wait for required CI checks to pass. Inspect `npm pack --dry-run --json` and confirm the tarball contains only intended package files.
9. Create the matching annotated Git tag and publish the exact version:

   ```bash
   npm publish --tag beta --access public
   ```

   Complete npm's required interactive 2FA flow; never disable 2FA to simplify a release.
10. Verify the registry result and install smoke test:

    ```bash
    npm view idevflow@beta version dist-tags --json
    pi -e npm:idevflow@beta --list-models
    ```

11. Create or publish the matching prerelease on GitHub only after the registry verification passes.

## App handoff reminder

For an iOS candidate, `idev_release promote` changes only the local base branch after a candidate-bound approval. `idev_apple archive` may then create a separately founder-approved local signed archive and candidate-bound receipt; it does not export or upload. The manual TestFlight handoff package records the exact evidence and explicit next actions. A macOS handoff records distribution readiness without signing, archive, upload, notarization, or distribution. All external side effects remain separate manual operations. See the [Apple release capability matrix](release-capabilities.md).
