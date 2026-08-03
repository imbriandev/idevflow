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

## Boundaries

M13a supports macOS discovery, build, test, and source-bound verification. It does not yet claim macOS release readiness, notarization, Mac App Store handoff, macOS-specific accessibility/performance proof, App Sandbox review, or universal iOS+macOS verification.

## Follow-up

- **M13b:** macOS specialist context, App Sandbox/entitlements/Hardened Runtime review, macOS quality evidence, and explicit Mac App Store or notarized distribution handoff.
- **M13c:** one approved work graph with an iOS+macOS verification matrix and all-platform promotion gate.
