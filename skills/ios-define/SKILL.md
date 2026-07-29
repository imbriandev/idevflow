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
3. Define one Simple, Lovable, Complete path that finishes a real job.
4. Include empty, loading, failure, accessibility, privacy, and trust expectations that affect the promise.
5. List explicit non-goals and a falsifiable TestFlight learning question.
6. Through write preflight, create the schema-valid configured `productMemory` and `slcSpec` JSON documents (defaults: `docs/pi-ios/product-memory.json` and `docs/pi-ios/slc.json`).
7. Run docs verification, postflight, finish, then `pi_ios_lifecycle integrate`. Use lifecycle status to report the validated product fingerprint. Recommend `/ios:plan` only after lifecycle reaches `defined`.

## Guardrails

- Do not write production code.
- Do not invent market or user evidence.
- Do not use “MVP” to excuse an incomplete primary flow.
- Stop for the founder before changing target user, monetization, or product promise.

## Output

Report the user/problem/promise, SLC path, non-goals, assumptions, product-document path, residual decisions, and next command.
