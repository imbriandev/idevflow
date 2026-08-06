# Workflow

## Before idea: new iOS shell

For a new app, install [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`), then use `idev_flow bootstrap_ios` in a clean Git repository. With founder confirmation, it uses XcodeGen to create a minimal SwiftUI app, unit-test target, privacy manifest, and shared scheme; it builds the shell for the iOS Simulator and commits it. This is a one-time precondition, not a lifecycle state. Existing Apple projects use the read-only adoption audit instead.

## 1. Define

Run `/idev:define` and describe the product, user, problem, constraints, and smallest useful outcome. Keep the bet narrow. The stage records product memory and a Simple, Lovable, Complete definition.

## 2. Plan

Run `/idev:plan`. The plan connects the definition to architecture, vertical slices, dependencies, path claims, risk, acceptance criteria, and verification strength. Review the plan before approving it. Approval freezes the graph and binds it to the plan commit.

## 3. Build

Run `/idev:build` for one approved slice. Preflight creates or resumes an authorized writer worktree. Change only claimed paths. Use `idev_exec` for managed build commands and keep the change narrow enough to verify.

## 4. Test

Run `/idev:test` to reproduce the behavior, implement the smallest responsible fix, and run the required verification profile. iOS uses an isolated simulator destination; macOS uses the native Mac destination. Universal projects require both platforms.

For release-quality verification, provide source-bound XCTest accessibility and performance evidence when configured. Metadata alone is not accepted.

## 5. Review

Run `/idev:review` after verification. Review covers the current integration commit, product acceptance, changed paths, risks, and evidence. A review verdict is invalidated by later source drift.

## 6. Ship

Run `/idev:ship` to create and approve a candidate. The candidate must have fresh release verification and all configured release gates. Promotion changes only the local base branch. The handoff explicitly lists external actions still required.

## 7. Learn and maintain

Run `/idev:learn` after user, tester, or distribution feedback. Record the evidence, decision, and next smallest experiment. Learning does not silently reopen or mutate an earlier approved plan.

For a post-handoff bug or change, do not treat the shipped candidate as currently verified. State the user-visible impact, then start a maintenance loop:

```text
idev_lifecycle start_maintenance
```

This returns the lifecycle to `defined` using the existing product definition. Plan and approve the narrowest change before implementation; maintenance never bypasses review or release verification.

## Founder mode

Describe the outcome, not the workflow: “assess this app”, “build this feature”, “fix this defect”, “keep this and start over”, or “prepare a TestFlight handoff”. iDevFlow chooses the eligible session and keeps Git worktrees, claims, receipts, and recovery details behind the status card. It handles bounded diagnosis, repair, verification, and valid integration itself; it asks only for scope, unresolved trade-offs, definition/plan/release approval, or founder-owned Apple evidence.

The coordinator does not run in the background. After founder approval of the exact candidate, “Prepare TestFlight handoff” may promote, archive, export, and upload that internal beta to App Store Connect; it never selects testers or distributes.

## Interruption

After reload or interruption, resume with:

```text
idev_runtime status
idev_doctor status
```

Resume or explicitly recover an owned writer before starting unrelated work. iDevFlow preserves abandoned source for diagnosis rather than deleting it.
