---
name: idev-plan
description: Turn an approved Apple-platform outcome into the smallest safe work graph.
compatibility: iDevFlow; iOS/macOS 26+, Swift 6.2+
---

# Plan

Inspect the relevant code and tests. Write a narrow DAG of user-visible slices with paths, acceptance, risk, platform, dependencies, and verification profile. Add architecture decisions only where this change requires one; prefer native, existing patterns over abstractions.

Use the configured work-graph path, verify docs, postflight, finish, integrate, then present the exact frozen plan for founder approval. Do not implement code, hide acceptance criteria, or broaden scope. Use `idev_context` only for consequential SwiftUI, state, privacy, payment, macOS, or concurrency decisions.
