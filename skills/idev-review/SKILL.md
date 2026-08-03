---
name: idev-review
description: Review a recent Apple-platform change or beta candidate for product quality, SwiftUI design, accessibility, interface copy, Swift correctness, concurrency, persistence, privacy, and performance with evidence-linked severity.
compatibility: iDevFlow; iOS/macOS 26+, Swift 6.2+
---

# iOS Review

Produce a bounded, evidence-linked verdict for the current source commit.

## Workflow

1. Identify the exact commit, diff, acceptance criteria, and requested review surfaces.
2. Inspect code and validate the current verification receipt and artifact hashes without silently expanding to a repository-wide audit.
3. Prioritize correctness, data loss, privacy, accessibility, and primary-flow failures before polish.
4. Cite actionable findings with file and line, impact, evidence, and smallest responsible route.
5. Separate blockers, important findings, polish, and non-findings.
6. Run or reuse valid integration-or-stronger verification for the exact integrated commit. Produce verdict JSON with `verdict`, `summary`, `findings`, and `residualRisk`, then submit it through `idev_lifecycle review`.
7. Do not edit code; only the kernel receipt may advance to `review_passed`. Route repairs through `/idev:build` or `/idev:test`.

## Specialist context

Call `idev_context` with `stage=review`, risk, scope, and requested surfaces. Start with `review-audit.md`; add SwiftUI, state/concurrency, privacy, monetization, copy, or testing references only when evidence and scope justify them. A deep audit requires the explicit `audit` surface and must state unaudited areas.

## Guardrails

- Review the code, not the author's intent.
- Do not inflate severity without demonstrated impact.
- Do not claim visual or simulator quality without artifacts.
- A verdict applies only to the reviewed source fingerprint.

## Output

List findings by severity, review surfaces, evidence, maturity assessment, verdict, and follow-up command.
