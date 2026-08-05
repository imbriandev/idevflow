# Milestone 15 — Founder Operating Loop

## Goal

Make iDevFlow feel like a founder's operating partner, not a Git/session orchestrator. A founder describes an outcome; iDevFlow owns recovery plumbing and asks only for product decisions or irreversible Apple actions.

The release boundary remains unchanged: iDevFlow prepares verified local archives and a TestFlight handoff; the founder performs App Store Connect upload, tester selection, and distribution.

## Product contract

Every conversational response answers only:

1. **Where are we?** — human stage name and outcome.
2. **What is blocked?** — one plain-language reason, or “nothing”.
3. **What do I decide next?** — one to three founder choices.

Session IDs, worktrees, claims, receipts, leases, and Git baselines are diagnostics, never normal-path instructions.

## M15a — Completed-work recovery

### Deliver

- Replace the `ready_for_integration` dead end with three founder choices:
  - **Integrate** — accept the exact completed evidence.
  - **Repair** — reopen its completed commit for a bounded correction and fresh verification.
  - **Keep and start over** — park the completed worktree, release claims, and preserve it for later repair.
- Require interactive confirmation for all three choices.
- Allow a preserved completed session to be reopened later; do not make ordinary `resume` reinterpret its old completion receipt.
- Treat local `.pi/settings.json` package configuration as non-blocking, while retaining dirty-source baseline protection.

### Touchpoints

- `extensions/idevflow/tools/session-tool.ts`
- `extensions/idevflow/sessions/{registry,service}.ts`
- `extensions/idevflow/coordinator/service.ts`
- `extensions/idevflow/git/baseline.ts`

### Acceptance

A founder can say “keep this and start over” without naming a session, and a later founder can say “repair that saved definition” without losing its commit or worktree. Source changes still block writer creation.

## M15b — Intent-first coordinator

### Deliver

- Map common founder intents to one bounded next action: define an idea, assess an existing app, fix a defect, continue work, start over, prepare a TestFlight handoff, or explain a blocker.
- Select a unique eligible session automatically. If several exist, show their human stage, outcome, and age—not task contents, paths, or IDs—and ask the founder to choose.
- Replace internal route wording with founder wording in coordinator prompts and status UI.
- Put a compact status card at every state boundary:

  ```text
  VerseRise · Define
  Blocked: The saved definition needs a small validation repair.
  Next: [Repair it] [Keep it and start over] [See technical details]
  ```

- Keep a “technical details” escape hatch with existing durable diagnostics for maintainers.

### Touchpoints

- `extensions/idevflow/coordinator/{service,prompt}.ts`
- `extensions/idevflow/ui/{status,update}.ts`
- `extensions/idevflow/index.ts`
- `tests/coordinator.test.ts`

### Acceptance

A clean Pi chat can continue a project by stating an intent, without slash commands or a session ID. Ambiguous choices fail safe and ask one human-readable question.

## M15c — Founder-facing delivery path

### Deliver

- Reframe the lifecycle in product language: **Idea → Shape → Build → Prove → Prepare handoff**.
- Keep internal lifecycle names for durable compatibility; do not migrate persisted runtime state solely for copy changes.
- At every external boundary, name the owner and evidence:
  - device StoreKit validation: founder/device owner;
  - Apple provisioning/signing: founder;
  - App Store Connect upload and tester distribution: founder;
  - local archive and evidence audit: iDevFlow.
- Make StoreKit evidence a visible founder checklist: purchase, restore, cancellation, expiry, and resubscribe on sandbox/TestFlight hardware. Simulator/local configuration evidence remains explicitly insufficient.

### Touchpoints

- `docs/{workflow,commands,release-capabilities}.md`
- `extensions/idevflow/tools/{runtime,apple,blocker,release}-tool.ts`
- `extensions/idevflow/ui/status.ts`

### Acceptance

A founder can tell whether the app is ready to hand off, exactly what must be done outside iDevFlow, and which evidence is missing—without reading a receipt or source file.

## Delivery order

1. Ship M15a locally and dogfood it on VerseRise before publishing. It removes the current recovery friction with the smallest safety-preserving diff.
2. Implement M15b against real founder prompts collected from VerseRise; do not create a natural-language classifier or background agent.
3. Implement M15c as copy/status/checklist work after the underlying StoreKit physical-device path is known.
4. Publish only after VerseRise completes one Define → Plan → Build → Prove → handoff run using the new flow.

## Non-goals

- No App Store Connect automation, upload, tester selection, or distribution.
- No weakening of signing, founder approval, source-bound verification, StoreKit, privacy, or release gates.
- No replacement workflow engine, database, or generic AI intent router.
