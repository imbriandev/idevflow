---
name: idev-define
description: Define or refine an indie Apple-platform app idea, target user, product promise, Simple Lovable Complete scope, non-goals, and falsifiable beta learning question before architecture or coding.
compatibility: iDevFlow; iOS/macOS 26+, Swift 6.2+
---

# iOS Define

Turn uncertainty into the smallest coherent product commitment.

## Workflow

1. Read existing product memory, specs, feedback, and status before asking questions already answered by the repository.
2. State the target user, painful situation, current workaround, product promise, and evidence versus assumptions.
3. Record each material claim in `ideaValidation.claims` as `founder_evidence`, `observed_feedback`, `assumption`, or `unknown`. Evidence and feedback require a founder-provided source; never turn an assumption into a fact.
4. Give every claim a confidence, impact, current status, and falsifiable validation plan. Market or competitor claims require founder-provided HTTPS source URLs; do not imply that Pi has performed research. Select one open assumption/unknown as `primaryAssumptionId` and state its TestFlight `learningQuestion`.
5. Set `discovery.disposition`: evidence is sufficient, research is complete, or a prototype is complete. For research, record the hypothesis, method, source, finding, and limitation. For a prototype, also record a project-relative artifact path, user task, and observed result. Never add production code to validate an idea.
6. Write the required skeptical critique: a viable alternative/workaround, adoption risk, invalidating signal, and every unresolved high/critical claim. Present it to the founder before integration.
7. Define one Simple, Lovable, Complete path that finishes a real job. Include explicit empty, loading, failure, accessibility, privacy, and trust expectations that affect the promise.
8. List explicit non-goals. Ask the founder to accept or revise the skeptical critique and every unresolved high/critical assumption before integration; the lifecycle tool confirms this interactively and records accepted claim IDs in the stage receipt.
9. Through write preflight, create the schema-version-3 configured `productMemory` and schema-version-2 `slcSpec` documents (defaults: `docs/idevflow/product-memory.json` and `docs/idevflow/slc.json`).
10. In `learn`, add founder/tester feedback, metric, or incident evidence and link it before changing any original claim to confirmed, weakened, or disproven.
11. Run docs verification, postflight, finish, then `idev_lifecycle integrate`. Use lifecycle status to report the validated product fingerprint. Recommend `/idev:plan` only after lifecycle reaches `defined`.

## Specialist context

For product ambiguity, onboarding, interface language, accessibility wording, or a paid-value hypothesis, call `idev_context` with `stage=define`, risk, task, and relevant surfaces. Read only its returned package paths. Apply `product-interface.md`; add `monetization.md` only when paid behavior is in scope. Do not load implementation checklists during ordinary product definition.

## Guardrails

- Do not write production code.
- Do not invent market, competitor, or user evidence; cite only a founder-provided source or mark it as an assumption/unknown.
- Do not use “MVP” to excuse an incomplete primary flow.
- Stop for the founder before changing target user, monetization, product promise, or accepting unresolved high/critical assumptions.

## Output

Report the user/problem/promise, evidence versus assumptions, SLC path, experience expectations, non-goals, TestFlight learning question, unresolved high-impact assumptions, product-document path, residual decisions, and next safe route.
