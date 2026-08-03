# macOS Release and Distribution

Use this reference for macOS release readiness, not for automatic distribution.

- Treat `CODE_SIGN_ENTITLEMENTS`, App Sandbox, and Hardened Runtime as source-controlled release inputs.
- Review the entitlements file against the app's actual capabilities; do not grant broad file, network, camera, microphone, or automation access speculatively.
- A Mac App Store handoff requires App Sandbox, a reviewed signing team, archive validation, App Store Connect upload, review, and distribution.
- A notarized handoff requires a reviewed Developer ID identity, Hardened Runtime, archive/export, notarization submission, ticket verification/stapling, and manual distribution.
- Never place certificates, private keys, API keys, notarization passwords, or App Store Connect credentials in product documents, receipts, prompts, or handoff JSON.
- iDevFlow records readiness and manual next steps only. It does not invoke `codesign`, `notarytool`, App Store Connect upload, or distribution.
