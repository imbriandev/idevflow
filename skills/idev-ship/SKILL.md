---
name: idev-ship
description: Verify an exact Apple-platform candidate and prepare a manual handoff.
compatibility: iDevFlow; macOS/Xcode; iOS/macOS 26+, Swift 6.2+
---

# Ship

Use fresh release verification for the exact reviewed commit. Validate privacy, release metadata, and monetization when present; require screenshots, accessibility, and performance only when the project enables full release evidence. Create the candidate, present blockers and known issues, and request founder approval before upload.

After approval, iDevFlow may promote, archive, export, and upload the exact internal beta. Never imply it pushed, selected testers, or distributed. Use `idev_context` for critical release surfaces only.
