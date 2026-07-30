---
name: ios-define
description: Define or refine an indie iOS app idea, target user, product promise, Simple Lovable Complete scope, non-goals, and falsifiable TestFlight learning question before architecture or coding.
compatibility: Pi iOS; iOS 26+, Swift 6.2+
---

# iOS Define

Turn uncertainty into the smallest coherent product commitment.

## Workflow

1. Read existing product memory, specs, feedback, and status before asking questions already answered by the repository.
2. State the target user, painful situation, current workaround, product promise, and evidence versus assumptions.
3. Record each material claim in `ideaValidation.claims` as `founder_evidence`, `observed_feedback`, `assumption`, or `unknown`. Evidence and feedback require a founder-provided source; never turn an assumption into a fact.
4. Give every claim a confidence, impact, current status, and falsifiable validation plan. Select one open assumption/unknown as `primaryAssumptionId` and state its TestFlight `learningQuestion`.
5. Define one Simple, Lovable, Complete path that finishes a real job. Include explicit empty, loading, failure, accessibility, privacy, and trust expectations that affect the promise.
6. List explicit non-goals. Ask the founder to accept or revise every unresolved high/critical assumption before integration; the lifecycle tool confirms this interactively and records accepted claim IDs in the stage receipt.
7. Through write preflight, create the schema-version-2 configured `productMemory` and `slcSpec` JSON documents (defaults: `docs/pi-ios/product-memory.json` and `docs/pi-ios/slc.json`).
8. Run docs verification, postflight, finish, then `pi_ios_lifecycle integrate`. Use lifecycle status to report the validated product fingerprint. Recommend `/ios:plan` only after lifecycle reaches `defined`.

## Specialist context

For product ambiguity, onboarding, interface language, accessibility wording, or a paid-value hypothesis, call `pi_ios_context` with `stage=define`, risk, task, and relevant surfaces. Read only its returned package paths. Apply `product-interface.md`; add `monetization.md` only when paid behavior is in scope. Do not load implementation checklists during ordinary product definition.

## Guardrails

- Do not write production code.
- Do not invent market, competitor, or user evidence; cite only a founder-provided source or mark it as an assumption/unknown.
- Do not use “MVP” to excuse an incomplete primary flow.
- Stop for the founder before changing target user, monetization, product promise, or accepting unresolved high/critical assumptions.

## Output

Report the user/problem/promise, evidence versus assumptions, SLC path, experience expectations, non-goals, TestFlight learning question, unresolved high-impact assumptions, product-document path, residual decisions, and next safe route.
