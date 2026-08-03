# Evidence-Linked Review and Audit

Load for `/canopy:review`, high-risk implementation self-review, or an explicit deep audit. Ordinary review stays scoped to the requested diff, screen, flow, or acceptance criteria.

## Personas and severity

Use only relevant perspectives: correctness/test, product/SLC, SwiftUI/accessibility/copy, persistence/concurrency, privacy/security, and release readiness.

- Critical: credible data loss, broken primary path, secret/privacy exposure, or unsafe external release.
- High: user-reachable beta blocker, serious regression, inaccessible primary task, or misleading behavior.
- Medium: confusing, brittle, slow, under-tested, or hard to maintain but not blocking.
- Low: polish, naming, or bounded cleanup.

Every finding needs file/line or runtime artifact, demonstrated impact, and smallest responsible route (`build`, `test`, manual decision, or ship blocker). State what was not audited. Do not inflate severity or call visual quality passed without rendered evidence.

## Focused checklist

- SLC promise and primary flow; first-run, loading, empty, error, permission, destructive, and recovery states.
- SwiftUI hierarchy/navigation, Dynamic Type, VoiceOver, localization, contrast, tap targets, and user-facing language.
- Correctness, edge cases, dependency direction, dead code, unnecessary abstraction, tests, cancellation, actor isolation, persistence/delete/migration risks.
- Secrets/logs/permissions/entitlements/sensitive storage and release metadata.
- Known issues, rollback/recovery, feedback channel, and exact verification provenance.

A deep audit is opt-in. It may inspect broader targets, dependencies, configuration, and architecture, but still reports gaps such as device-only behavior, remote server state, localization correctness, or unprofiled performance.
