---
name: idev-review
description: Produce an evidence-linked verdict for an exact Apple-platform commit.
compatibility: iDevFlow; iOS/macOS 26+, Swift 6.2+
---

# Review

Inspect the exact diff, acceptance criteria, and valid receipt. Prioritize correctness, data loss, privacy, accessibility, and primary-flow failures. Report only actionable findings with location, impact, evidence, and the smallest repair route; name unaudited gaps.

Submit a structured verdict through `idev_lifecycle review`. Do not edit code, expand silently to a repo audit, or claim visual quality without source-bound artifacts. Use `idev_context` only for requested review surfaces.
