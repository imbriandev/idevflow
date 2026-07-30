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

## M12b follow-up

- Source-cited market/competitor research contract, only when a reviewed research capability exists.
- Required skeptical critique pass with founder-visible unresolved assumptions.
- Learning-stage updates that mark original claims confirmed, weakened, or disproven using feedback and metrics.
- Behavioral evaluations for solution-first ideas, fabricated claims, scope creep, ambiguous monetization, and privacy/trust risks.

## Evidence

`tests/product-planning.test.ts` covers evidence/source requirements, primary hypothesis validity, experience expectations, legacy compatibility, and quality-gate rejection. `tests/full-lifecycle.test.ts` proves that a high-impact open assumption cannot integrate until the exact claim is accepted.
