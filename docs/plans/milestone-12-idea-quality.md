# Milestone 12 — Idea Quality Gate

## Purpose

Make the define stage honest, testable, and founder-controlled without pretending a model can prove product-market fit.

## M12a delivered

- Product memory and SLC schema version 2 templates.
- Material claims labeled as `founder_evidence`, `observed_feedback`, `assumption`, or `unknown`.
- Required source text for evidence/feedback claims; unverified claims remain assumptions or unknowns.
- Claim confidence, impact, status, validation plan, a primary open hypothesis, and a TestFlight learning question.
- Required empty, loading, failure, accessibility, privacy, and trust expectations for a new definition.
- Deterministic rejection of incomplete idea records.
- Interactive founder confirmation before integrating a definition that retains unresolved high/critical assumptions; accepted claim IDs are bound into the stage receipt.
- Legacy schema-1 documents remain readable for planning and historical projects, but cannot complete a new define-stage integration.

## Non-goals

This gate does not score product-market fit, fabricate research, browse competitors, or treat model critique as evidence. It validates honesty and completeness of the product bet, not whether the bet will win.

## M12b delivered

- Market/competitor claims carry a scope and require at least one founder-provided HTTPS source URL. Pi does not claim to have performed research and no unreviewed browsing capability was added.
- A required skeptical critique records the viable alternative, adoption risk, invalidating signal, and unresolved high-impact claims. Definition integration requires an interactive founder acceptance of that critique.
- Learning evidence is typed as founder feedback, tester feedback, metric, or incident. Any original claim moving from `open` to `confirmed`, `weakened`, or `disproven` must link this evidence, and learn-stage integration rejects a no-op claim status update.

## Remaining follow-up

- Behavioral evaluations for solution-first ideas, fabricated claims, scope creep, ambiguous monetization, and privacy/trust risks.
- A reviewed research capability may later populate the same source contract; it must retain citations and never convert model inference into evidence.

## Evidence

`tests/product-planning.test.ts` covers evidence/source requirements, primary hypothesis validity, citation policy, experience expectations, learning-evidence linkage, legacy compatibility, and quality-gate rejection. `tests/full-lifecycle.test.ts` proves that a high-impact open assumption cannot integrate until the exact claim is accepted and that the later learning update concludes that claim from tester feedback.
