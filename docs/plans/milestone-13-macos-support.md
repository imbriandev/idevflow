# Milestone 13 — macOS Support

## M13a delivered

- Config schema 6 adds `xcode.platform`, defaulting migrated projects to `ios` and accepting `macos` explicitly.
- Xcode discovery binds the selected platform and reads `MACOSX_DEPLOYMENT_TARGET` for macOS apps.
- macOS verification runs native `xcodebuild build` and `test` with `platform=macOS`, isolated DerivedData, xcresults, artifact hashing, secret scanning, and commit-bound receipts.
- macOS verification does not acquire an iOS simulator lease or require a simulator proof.
- A real SwiftUI macOS app fixture proves native build, XCTest execution, postflight, and writer completion through `CANOPY_MACOS_XCODE_E2E=1`.
- Existing schema-5 projects migrate to platform `ios`; existing iOS behavior remains unchanged.

Configure a macOS project in `.canopy/config.json`:

```json
{
  "schemaVersion": 7,
  "xcode": {
    "platform": "macos",
    "requiredPlatforms": ["macos"],
    "configuration": "Debug"
  }
}
```

The remaining config fields are initialized and migrated by `canopy_runtime`; do not replace the full file with this fragment.

## M13b delivered

- macOS release manifests require App Sandbox, Hardened Runtime, entitlements path, signing identity, team ID, and HTTPS support/privacy URLs.
- The bounded `macos-release.md` specialist reference covers platform-specific security and manual distribution without loading secrets or release credentials.
- The security gate reads the project entitlements and verifies `com.apple.security.app-sandbox`, the Xcode `CODE_SIGN_ENTITLEMENTS` path, and `ENABLE_HARDENED_RUNTIME=YES`.
- `canopy_release` exposes `mac_handoff` for `mac-app-store` and `notarized` targets. It requires a clean reviewed commit, fresh release verification, privacy/monetization gates, exact Xcode metadata, and interactive founder acknowledgement.
- The generated handoff is local and source-bound. It records that signing, archive, upload, notarization, and distribution did not happen, with target-specific manual next steps.
- iOS TestFlight candidate creation rejects macOS explicitly; macOS distribution uses the separate handoff path.

## M13c delivered

- Config schema 7 adds `xcode.requiredPlatforms`; universal apps set `["ios", "macos"]` while `xcode.platform` remains the active single-platform default.
- Work graph schema 2 binds every slice to `ios`, `macos`, or both. Pipeline state and immutable worker packets preserve that platform scope.
- `canopy_verify` accepts `matrix=true` and runs every required platform against one exact source fingerprint. It persists one combined receipt referencing each platform child receipt.
- Postflight/review can consume the combined fingerprint. Release services resolve the target child receipt and reject a single-platform receipt whenever multiple platforms are required.
- Coordinator prompts/dashboard expose required platforms. A real universal SwiftUI fixture proves one commit builds/tests on iOS and native macOS.

## Boundaries

M13a–c do not invoke `codesign`, `notarytool`, App Store Connect, upload, or distribution. iOS and macOS handoffs remain independent manual decisions even when their evidence shares one universal matrix.
