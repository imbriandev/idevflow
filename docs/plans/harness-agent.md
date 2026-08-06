# Harness-agent upgrade

## Outcome

A founder states an outcome such as “prepare this beta” or “fix release blockers”; iDevFlow inspects, repairs reversible local state, and executes bounded work. It asks only for product scope, commercial/App Store mutation, signing/provisioning, promotion, upload, or distribution.

## Delivery order

1. **Founder facade (now):** one `idev_flow` entry point provides plain-language project and beta readiness. Expired leases recover automatically; kernel tool names remain internal.
2. **Release executor:** one founder confirmation for an exact candidate performs the eligible local sequence (promotion, archive, export, upload), stopping at the first real gate. It never selects testers or distributes.
3. **App Store reconciliation:** compare the project monetization manifest with App Store Connect; present the exact IAP create/update diff and apply it only after founder confirmation.
4. **Continuation:** persist the blocked next action and resume it from the next founder request; no background mutation or unattended upload.

## Non-goals

No generic workflow DSL, daemon, remote tester selection, external distribution, or automatic commercial changes.

## Acceptance

- Founder can ask “is this beta ready?” without seeing `idev_*` choreography.
- Routine recovery requires no confirmation and preserves all source.
- One decision card covers one exact remote action and its irreversible impact.
- Every App Store mutation has a displayed diff, founder confirmation, and redacted receipt.
