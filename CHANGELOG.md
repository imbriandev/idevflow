# Changelog

## 0.3.0-beta.4 — 2026-08-05

- Add a read-only existing-project audit and explicit adoption acknowledgement before lifecycle definition.
- Make the dashboard distinguish an existing project from an iDevFlow-adopted project.
- Notify at Pi session start when the public npm beta tag differs from the installed version; the lookup sends no project data and can be disabled.
- Add an explicit post-handoff maintenance loop that requires a user-visible reason and returns to planning without treating a shipped app as current evidence.
- Add primary-flow quality contracts, measured metric learning evidence, and macOS product-experience guidance.
- Add opt-in, source-bound AI visual review using the active Pi provider/model.

## 0.3.0-beta.3 — 2026-08-05

- Add a read-only existing-project audit route when an Apple-platform project is detected before lifecycle adoption.
- Clarify npm and Git project-local installation paths and update guidance.

## 0.3.0-beta.2 — 2026-08-03

- Release the project under the iDevFlow brand and `idevflow` package identity.
- Rename commands to `/idev:*`, tools to `idev_*`, and local runtime state to `.idevflow/`.
- Preserve project state through automatic migration from `.canopy/` and `.pi-ios/`.
- Verify iOS, macOS, universal-platform, and manual TestFlight handoff paths on Xcode 26 CI.

Historical tags before this release use earlier product names.
