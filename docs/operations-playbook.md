# iDevFlow Operations Playbook

This guide explains how to operate iDevFlow from an idea through a verified TestFlight handoff. iDevFlow is in beta. Git push, App Store Connect upload, and tester distribution remain explicit founder decisions.

Use one conversational coordinator agent for everyday work. It reads durable project state, recommends the next safe route, and can supervise the existing worker pipeline only after an approved plan. The seven `/idev:*` stage commands remain optional manual escape hatches; founders do not need to memorize them.

## 1. Prepare a project

Before starting, make sure the project has:

- a clean Git repository with a valid author identity;
- Node.js 22+, Pi 0.82.1+, and macOS/Xcode with an iOS simulator when app verification is needed;
- at least a minimal Xcode app project before building a new app.

Start Pi in the app directory:

```bash
cd /path/to/MyApp
pi
```

iDevFlow loads globally when installed. If the current Pi session was opened before an extension update, run `/reload`.

Ask the agent to initialize the runtime:

> Initialize iDevFlow runtime for this project.

The agent calls `idev_runtime initialize`. Local state is stored under `.idevflow/` and ignored by Git. Do not edit this directory directly.

## 2. Define — commit to the smallest product

Tell the coordinator about the user, painful situation, current workaround, and desired outcome. It routes an uninitialized or `idea` project to definition.

Example:

> I want an app that helps freelance designers capture work time faster. Define the Simple Lovable Complete scope for the first beta.

The output includes the target user, problem, promise, primary flow, empty/loading/failure/accessibility/privacy/trust expectations, non-goals, and a TestFlight learning question. Material claims are explicitly labeled as founder evidence, observed feedback, assumptions, or unknowns; evidence/feedback must retain a founder-provided source. Unresolved high-impact assumptions require an interactive founder acceptance before definition integration. iDevFlow writes schema-version-2 product documents at `docs/idevflow/product-memory.json` and `docs/idevflow/slc.json`.

The founder must make an explicit decision before changing the target user, monetization, or product promise.

## 3. Plan — turn the SLC into a work graph

After definition is integrated, ask the coordinator to plan the product. It routes a `defined` project to planning.

Example:

> Plan the defined SLC. Prefer SwiftUI and local-first SwiftData, with no login in the first beta.

Planning creates a work graph with vertical slices, dependencies, path claims, risk, acceptance criteria, and verification strategy. The agent presents the graph fingerprint. The founder must explicitly approve the plan before implementation starts.

Call out persistence migration, identity, payments, permissions, destructive data, or signing work so the plan can assign the appropriate risk and stop conditions.

## 4. Build — implement one approved slice

After plan approval, ask the coordinator to build a specific slice or the approved plan.

Example:

> Implement the approved “Create and start a time entry” slice.

iDevFlow performs preflight, creates an isolated worktree, claims paths, selects specialist context, runs verification, records postflight evidence, and controls integration. Do not create worktrees or receipts manually, and do not modify paths outside the approved claim.

Each slice should deliver one complete vertical behavior with focused tests where there is a stable behavioral seam. Architecture, payment, privacy, signing, or destructive-behavior changes require a founder decision.

## 5. Test — turn uncertainty into evidence

Tell the coordinator about bugs, flaky behavior, or an unproven claim.

Example:

> Reproduce and fix this issue: force-closing the app prevents an active timer from being restored.

The required flow is reproduction, bounded diagnosis, the smallest responsible repair, a regression proof, and a verification receipt. “Could not reproduce” is not a pass, and tests must not be weakened just to make a build green.

Primary-flow, accessibility, and performance claims need suitable simulator or XCTest evidence, not only a successful build.

## 6. Review — obtain an independent beta verdict

Ask the coordinator to review after integration verification.

Example:

> Review the time-entry flow with focus on SwiftUI state, accessibility, SwiftData persistence, and privacy.

Review does not edit source. It produces an evidence-linked verdict with blockers, important findings, polish, residual risk, and a repair route. Return to `/idev:build` or `/idev:test` for required repairs.

## 7. Ship — create a verified handoff, not an external release

Ask the coordinator to prepare the beta when the exact candidate has passed review.

iDevFlow requires fresh release verification, critical ship context, privacy/release metadata, screenshot variants, and XCTest quality evidence. Accessibility proof must use `XCUIApplication.performAccessibilityAudit`; performance proof must use a named XCTest metric and a project-owned budget.

When StoreKit or RevenueCat is present, the monetization manifest and restore/entitlement evidence must be complete.

After all gates pass, iDevFlow creates a candidate. The founder approves an exact candidate using an expiring token; `promote` changes only the local base branch. `handoff` creates a package containing evidence, known issues, and the remaining external steps.

iDevFlow does not push Git, archive or export an IPA, sign in to App Store Connect, upload builds, or distribute to testers.

## 8. Learn — decide the next iteration from feedback

After a beta, provide feedback, incidents, metrics, or founder observations to the coordinator.

Example:

> Here is the first week of TestFlight feedback: [paste feedback]. Classify it as now/later/not-do and propose the next bet.

iDevFlow preserves valuable user language, separates evidence from hypotheses, and routes the next focus to define, plan, build, or test.

## Status and recovery

Ask the agent for the current status, or use these tools:

- `idev_runtime status` — runtime and lifecycle state;
- `idev_doctor status` — human-readable diagnostics;
- `idev_doctor report` — metadata-only support report;
- `idev_pipeline status` — multi-agent pipeline state;
- `idev_pipeline reconcile` — detects and reconciles lost worker leases according to policy.

Recovery never deletes unintegrated source, branches, worktrees, packets, or logs. Do not delete `.idevflow/` while work is active.

## Founder checklist

1. Define: confirm the user, promise, and non-goals.
2. Plan: approve the frozen graph before implementation.
3. High-risk work: decide architecture, privacy, payment, signing, and destructive-data scope.
4. Review: accept the verdict or route findings to repair.
5. Ship: approve the exact candidate and distribution target.
6. External release: deliberately push, upload, and distribute after the handoff.

## Short rules

- Do not code before the plan is approved.
- Do not claim a gate passed without a iDevFlow receipt.
- Do not bypass worktrees, path claims, verification, or approval gates.
- Do not treat a green build as sufficient accessibility, performance, or release-quality evidence.
- Do not let an agent push or distribute externally without an explicit founder decision.
