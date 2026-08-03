# Clean-Break Namespace Migration

## Outcome

iDevFlow v2 presents one coherent package identity:

- TypeScript extension source lives under `extensions/idevflow/`.
- Per-project deterministic state lives under ignored `.idevflow/`.
- Public package documentation describes current behavior and current boundaries.

## Scope

The change updates source imports, tests, package discovery, runtime paths, Git exclusion, proof containment, worker packet paths, documentation, and package artifacts. Public tool names remain `idev_*`; no workflow behavior is delegated to external runtimes.

## Safety properties

- Runtime state remains ignored and created with restrictive permissions.
- Claims protect `.idevflow/` and `.pi/` control state from product writes.
- Artifact/proof containment permits only the authorized writer worktree or `.idevflow/` runtime root.
- Source, skills, documentation, and package manifest are scanned for retired identifiers before release.

## Proof

The verification suite covers initialization, state/config migration, concurrent claims, pipeline packets, receipts, release gates, quality evidence, and package loading under the new namespace. The release evidence baseline also includes real Xcode build and handoff tests.
