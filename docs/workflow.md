# Workflow

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

## 7. Learn

Run `/idev:learn` after user, tester, or distribution feedback. Record the evidence, decision, and next smallest experiment. Learning does not silently reopen or mutate an earlier approved plan.

## Conversational mode

You can describe the next product decision or defect instead of invoking a command. The coordinator reads durable state at interaction boundaries and recommends the safe next route. It does not replace lifecycle gates or run in the background.

## Interruption

After reload or interruption, resume with:

```text
idev_runtime status
idev_doctor status
```

Resume an owned writer or reconcile a pipeline before starting unrelated work. iDevFlow preserves abandoned source for diagnosis rather than deleting it.
