# Security Notes

## Dependency audit

The package imports Pi core libraries as peer dependencies and does not bundle them for distribution. Development currently pins Pi `0.82.1` for type checking and extension-load tests.

As of 2026-07-29, `npm audit` reports `GHSA-mh99-v99m-4gvg` in `brace-expansion@5.0.7`, nested under the development copy of `@earendil-works/pi-coding-agent@0.82.1` through `minimatch`. `brace-expansion@5.0.8` contains the upstream fix, but npm does not replace Pi's nested copy through a root override. This repository does not call that dependency directly. Track and remove this note when the pinned Pi release resolves the transitive dependency.

## Runtime model

Pi extensions execute with the user's system permissions. Pi iOS therefore fails closed for untrusted project mutation, direct write paths outside claimed worktrees, expired writer or simulator leases, mutating shell commands, non-interactive registry repair, stale postflight receipts, weak verification profiles, missing xcresult/test evidence, source-mismatched quality proof, and candidate actions that later milestones will approval-bind.

Supervised process logs are redacted before persistence. Completed verification bundles are recursively scanned for credential patterns; contaminated local artifact directories are removed and no successful receipt is issued.
