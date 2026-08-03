# Milestone 13 — macOS Support

## M13a delivered

- Config schema 6 adds `xcode.platform`, defaulting migrated projects to `ios` and accepting `macos` explicitly.
- Xcode discovery binds the selected platform and reads `MACOSX_DEPLOYMENT_TARGET` for macOS apps.
- macOS verification runs native `xcodebuild build` and `test` with `platform=macOS`, isolated DerivedData, xcresults, artifact hashing, secret scanning, and commit-bound receipts.
- macOS verification does not acquire an iOS simulator lease or require a simulator proof.
- A real SwiftUI macOS app fixture proves native build, XCTest execution, postflight, and writer completion through `PI_MACOS_XCODE_E2E=1`.
- Existing schema-5 projects migrate to platform `ios`; existing iOS behavior remains unchanged.

Configure a macOS project in `.pi-ios/config.json`:

```json
{
  "schemaVersion": 6,
  "xcode": {
    "platform": "macos",
    "configuration": "Debug"
  }
}
```

The remaining config fields are initialized and migrated by `pi_ios_runtime`; do not replace the full file with this fragment.

## M13b delivered

- macOS release manifests require App Sandbox, Hardened Runtime, entitlements path, signing identity, team ID, and HTTPS support/privacy URLs.
- The bounded `macos-release.md` specialist reference covers platform-specific security and manual distribution without loading secrets or release credentials.
- The security gate reads the project entitlements and verifies `com.apple.security.app-sandbox`, the Xcode `CODE_SIGN_ENTITLEMENTS` path, and `ENABLE_HARDENED_RUNTIME=YES`.
- `pi_ios_release` exposes `mac_handoff` for `mac-app-store` and `notarized` targets. It requires a clean reviewed commit, fresh release verification, privacy/monetization gates, exact Xcode metadata, and interactive founder acknowledgement.
- The generated handoff is local and source-bound. It records that signing, archive, upload, notarization, and distribution did not happen, with target-specific manual next steps.
- iOS TestFlight candidate creation rejects macOS explicitly; macOS distribution uses the separate handoff path.

## Boundaries

M13a/M13b support macOS discovery, build/test, security readiness, and a manual distribution handoff. They do not invoke `codesign`, `notarytool`, App Store Connect, upload, or distribution. M13c remains the universal iOS+macOS verification matrix and all-platform promotion gate.
