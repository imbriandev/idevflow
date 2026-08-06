---
name: idev-test
description: Reproduce, minimally repair, and prove uncertain Apple-platform behavior.
compatibility: iDevFlow; iOS/macOS 26+, Swift 6.2+
---

# Test

State expected versus observed behavior and reproduce before editing. If it does not reproduce, report the uncertainty; it is not a pass. Isolate the smallest cause, preflight, add the narrowest stable regression check, and repair that cause.

Verify through `idev_verify`, then postflight, finish, and integrate with the receipt fingerprint. Do not guess, weaken tests, or hide flaky evidence with retries. Use `idev_context` only for the failing surface; use the native macOS destination when relevant.
