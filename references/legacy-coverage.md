# Legacy Reference Coverage

This ledger maps the 44 reference documents in the reference-only AppForge repository to Pi iOS. **Ported** means the expert reasoning was consolidated into a Pi-native cold reference. **Kernel** means the behavior is stronger as deterministic TypeScript code and is not duplicated as authority-bearing prose. **Intentionally omitted** means it depends on Python/remote/App Store operations outside Pi iOS’s explicit local/manual boundary.

| Legacy reference | Pi iOS disposition |
| --- | --- |
| `agent-harness.md` | Kernel: preflight, claims, leases, postflight, receipts, and pipeline |
| `beta-quality-playbook.md` | Ported: `testing-quality.md`, `review-audit.md`, `release-testflight.md` |
| `ci-pr-workflow.md` | Kernel + docs: CI workflow, integration lock, installation/release process |
| `code-review-cleanup.md` | Ported: `review-audit.md`; deterministic postflight remains kernel |
| `codebase-audit-playbook.md` | Ported: `review-audit.md` explicit deep-audit boundary |
| `coding-discipline.md` | Ported: stage skills plus `context-discipline.md` |
| `context-budget.md` | Ported and improved: `context-discipline.md` + `pi_ios_context` selector |
| `docs-sync.md` | Kernel: source-bound stage receipts/product documents; skills require reporting |
| `engineering-execution-playbook.md` | Kernel: validated DAG work graph and pipeline scheduler |
| `evidence-ledger.md` | Kernel: lifecycle, verification, integration, candidate, and handoff receipts |
| `founder-operating-rhythm.md` | Ported: `product-interface.md` and `ios-learn` skill |
| `herdr-founder-playbook.md` | Ported: product/ship skills; legacy automation details omitted |
| `herdr-worker-provider.md` | Kernel: restricted Pi subprocess workers and immutable packets |
| `interface-writing.md` | Ported: `product-interface.md` |
| `ios-architecture-playbook.md` | Ported: `swift-state.md`, `swiftui-experience.md`, `native-integrations.md` |
| `ios-domain-coverage.md` | Replaced by this directory, `pi_ios_context`, and skills |
| `lifecycle-commands.md` | Kernel + seven skills/commands |
| `maturity-scorecard.md` | Ported: `review-audit.md` maturity/severity method |
| `monetization-harness.md` | Ported: `monetization.md`; local manifest gate is kernel |
| `multi-agent-git-protocol.md` | Kernel: worktrees, claims, coordinator and integration epochs |
| `paul-hudson-swift-checks.md` | Ported by surface: `swiftui-experience.md`, `swift-state.md`, `testing-quality.md` |
| `performance-resource-harness.md` | Kernel: isolated resources, receipts, retention; performance reasoning in references |
| `pipeline-automation.md` | Kernel: `pipeline/`, worker packets, reconciliation, batch splitting |
| `privacy-security-review.md` | Ported: `privacy-security.md`; release gate is kernel |
| `product-founder-playbook.md` | Ported: `product-interface.md` |
| `production-release-harness.md` | Intentionally omitted: production/App Store Connect remains manual, no credentials |
| `project-memory.md` | Kernel/templates: product memory, SLC, work graph, privacy, monetization, release |
| `quality-gate.md` | Ported: `testing-quality.md`; proof contracts are kernel |
| `release-operations.md` | Ported: `release-testflight.md`; mutation remains manual-boundary kernel |
| `review-personas.md` | Ported: `review-audit.md` |
| `shipping-map.md` | Ported: `release-testflight.md`, product/learn skills |
| `skill-routing.md` | Replaced by explicit lifecycle commands and `pi_ios_context` |
| `slc.md` | Ported: `product-interface.md` and SLC schema validation |
| `source-inspiration.md` | Intentionally omitted: attribution/history, not runtime expert guidance |
| `stage-contracts.md` | Kernel: typed lifecycle contracts and templates |
| `status-recovery-harness.md` | Kernel: doctor, journals, session/pipeline recovery |
| `swift-concurrency-checks.md` | Ported: `swift-state.md` |
| `swift-core-checks.md` | Ported across `swiftui-experience.md`, `swift-state.md`, `testing-quality.md` |
| `swift-testing-checks.md` | Ported: `testing-quality.md` |
| `swiftdata-checks.md` | Ported: `swift-state.md` |
| `swiftui-checks.md` | Ported: `swiftui-experience.md`, `testing-quality.md` |
| `swiftui-design-quality.md` | Ported: `swiftui-experience.md` |
| `verification-harness.md` | Kernel: adaptive profiles, receipts, proof artifacts, release freshness |
| `workflow-evals.md` | Tests: mock-agent, lifecycle, pipeline, real Xcode/handoff, cutover gates |

No legacy Python script, provider, remote reconciliation adapter, credential path, implicit upload, or App Store mutation is imported into Pi iOS.
