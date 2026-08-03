# Core concepts

## Durable state

The project is the source of truth. iDevFlow stores journals, snapshots, receipts, approvals, and recovery metadata in the ignored `.idevflow/` directory. Pi session entries are only a UI mirror and are never authoritative.

## Lifecycle stages

| Stage | Purpose | Typical output |
| --- | --- | --- |
| Define | Make the product bet and scope explicit | Product memory and SLC definition |
| Plan | Turn the definition into an implementable graph | Architecture, slices, risks, acceptance |
| Build | Implement one authorized slice | Source commit in a writer worktree |
| Test | Reproduce behavior and prove the fix | Verification receipt and evidence |
| Review | Evaluate product and engineering quality | Source-bound review verdict |
| Ship | Verify a release candidate and prepare handoff | iOS or macOS release handoff |
| Learn | Synthesize feedback into the next narrow decision | Learning record |

Lifecycle transitions are kernel operations. Agent prose cannot advance a stage or create approval.

## Writer worktrees

A write-capable session uses a sibling Git worktree instead of the trusted checkout. A preflight establishes the writer lease and path claims. Built-in writes are allowed only inside the authorized worktree and claimed paths. Postflight records changed paths and evidence; finish rejects source drift or uncommitted changes.

## Evidence and receipts

A verification receipt binds evidence to the source commit, dirty-content fingerprint, project, configuration, toolchain, destination, and verification profile. A receipt is not a statement that tests were run: it is a machine-checked record with retained artifacts.

Release proof is fresh. Non-release receipts may be reused only while their source and artifacts remain valid.

## Approvals

Plan approval binds the exact plan and graph fingerprint. Ship approval is interactive, expiring, single-use, and bound to a candidate commit, fingerprint, and target. Approval never grants permission to push, upload, sign, notarize, or distribute.

## Workers

Optional workers run in isolated processes and worktrees with bounded task packets and claimed paths. They can submit source and evidence, but only the coordinator can integrate. Workers cannot approve, promote, push, upload, or distribute.

## Release boundaries

For iOS, iDevFlow prepares an exact TestFlight handoff. For macOS, it prepares distribution-readiness evidence. Signing, archive/export, notarization, upload, App Store Connect operations, push, and tester distribution remain explicit manual steps.
