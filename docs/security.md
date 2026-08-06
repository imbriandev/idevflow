# Security Notes

## Dependency audit

The package imports Pi core libraries as peer dependencies and does not bundle them for distribution. Development currently pins Pi `0.82.1` for type checking and extension-load tests.

As of 2026-08-05, `npm audit` reports 3 advisories (1 moderate, 2 high): `brace-expansion@5.0.7` (`GHSA-mh99-v99m-4gvg`, `GHSA-rgw5-rvv9-x895`) and `undici@8.5.0` (`GHSA-8xcm-r25x-g524`, `GHSA-4cwx-7wf7-3272`, `GHSA-m8rv-5g2x-5cg5`, `GHSA-jr45-8vmc-qm54`, `GHSA-v3r7-h72x-cjcm`) under the development-only `@earendil-works/pi-coding-agent@0.82.1`. iDevFlow neither imports them directly nor bundles peer dependencies; a root override cannot replace Pi's nested copies. Track and remove this note when the pinned Pi release resolves them.

## Update check

At Pi session start, iDevFlow may request the public `https://registry.npmjs.org/idevflow` metadata to compare the installed version with the public `beta` dist-tag. The request contains no project, source, runtime, credential, or user data. Set `IDEVFLOW_DISABLE_UPDATE_CHECK=1` to disable it.

## AI visual review

`idev_visual_review` is opt-in and interactive. It sends only the selected source-bound PNG screenshot and a fixed review prompt to the active Pi provider/model; it does not grant the reviewer source, tools, runtime state, or mutation authority. The report is advisory evidence and never independently passes verification or release gates. Do not submit screenshots containing secrets or private user data.

## Runtime model

Pi extensions execute with the user's system permissions. iDevFlow therefore fails closed for untrusted project mutation, direct write paths outside claimed worktrees, expired writer or simulator leases, mutating shell commands, non-interactive registry repair, stale postflight receipts, weak verification profiles, missing xcresult/test evidence, source-mismatched quality proof, and candidate actions that later milestones will approval-bind.

Supervised process logs are redacted before persistence. Worker capabilities and explicitly passed model credential values are literal-redacted as well as pattern-redacted; credential values are override-only for worker invocation and are not inherited by ordinary managed build processes. Completed verification bundles are recursively scanned for credential patterns; contaminated local artifact directories are removed and no successful receipt is issued.

Multi-agent workers receive immutable digest-checked, credential-shaped-content-free task packets. Their capability is random, hash-only in durable state, and checked on every worker tool call. Workers run in distinct supervised Pi processes with package/project extension loading disabled and a restricted tool list. They cannot call integration, release, approval, push, upload, or distribution operations. The coordinator has a leased, journaled ownership boundary; takeover and retry are interactive and fail closed. Lost, conflicted, or exhausted worker source is retained for diagnosis rather than automatically removed.

`idev_doctor report` is metadata-only: it returns aggregate state, revisions, identifiers, and recommendations, but excludes source/task text, worker packets and logs, approval tokens, receipt payloads, and credentials. Expired leases are recovered automatically; this only marks registry records stale and never deletes source, branches, or worktrees.

Specialist guidance is package-owned static Markdown selected by `idev_context`; no project-provided reference path is honored. Pipeline workers may read only canonical `.md` files under that package `references/` directory, using a symlink-safe containment check. This read exception never permits package source, project source outside a claimed worktree, or any write.

Plan approval is interactive and bound to graph fingerprint plus plan commit. Ship approval is interactive, expiring, single-use, stored only as a token hash, and bound to candidate fingerprint, commit, and target. Candidate creation and promotion revalidate source and artifact hashes. Local promotion performs no push, upload, archive/export, or distribution; the final handoff records those boundaries explicitly.
