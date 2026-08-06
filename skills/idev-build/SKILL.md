---
name: idev-build
description: Implement one approved Apple-platform slice with commit-bound evidence.
compatibility: iDevFlow; iOS/macOS 26+, Swift 6.2+
---

# Build

Confirm the approved slice, then preflight before editing. Read only the local source/test neighborhood and implement the smallest complete behavior within claimed paths. Add a focused test when it catches a real regression.

Run `idev_verify` (matrix for both approved platforms), then postflight with its fingerprint, finish, and integrate the exact slice. Do not refactor unrelated code, expand scope, write outside claims, or call unrun checks passing. Use `idev_context` only for non-trivial touched surfaces.
