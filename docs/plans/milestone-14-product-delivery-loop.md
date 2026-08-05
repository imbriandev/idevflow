# Milestone 14 — Product Delivery Loop

## Goal

Make iDevFlow useful for the life of a real Apple-platform product: adopt an existing repository honestly, make a bounded change after a handoff, verify the primary flow, and learn from measured delivery evidence.

This milestone does not loosen existing worktree, approval, verification, review, promotion, or external-distribution boundaries.

## M14a — Existing-project baseline

Delivered:

- Detect an existing Apple-platform project before a new lifecycle definition is assumed.
- Provide `idev_doctor audit`, a read-only structure and Git-baseline report.
- Require interactive `idev_runtime adopt_existing` acknowledgement before routing to definition.
- Persist only local onboarding metadata; adoption does not modify source, advance lifecycle, or manufacture verification evidence.

Next refinement: enrich the audit with discovered scheme/target, test and CI inventory, permissions/dependencies, and explicit unknowns without reading source into durable state.

## M14b — Maintenance loop

Delivered:

- A `testflight_handoff` routes to maintenance instead of implying that a new product definition is required.
- `idev_lifecycle start_maintenance` requires interactive confirmation and a user-visible issue/change reason.
- The operation returns lifecycle to `defined`, retaining the current product definition but requiring a new plan approval before implementation.

This is deliberately not an emergency bypass. A hotfix may have a narrow plan, but it still needs source-bound verification and review.

## M14c — Primary-flow quality contract

Planned:

- Require relevant primary-flow slices to state first-run, empty, loading, failure, permission, cancellation, recovery, accessibility, and measurement expectations.
- Bind applicable acceptance criteria to verification and review rather than prose-only checklists.
- Keep trivial documentation or isolated refactor slices out of this contract.

## M14d — Visual and device-quality review

Planned:

- Add an explicit primary-flow visual verdict using source-bound screenshots for configured appearance and Dynamic Type states.
- Record unaudited device-only, remote-service, localization, and performance gaps instead of inferring coverage from simulator success.

## M14e — Measured learning and macOS parity

Planned:

- Connect a learning hypothesis to a named event/metric, threshold, observed result, and decision.
- Bring macOS workflow guidance to parity with iOS: windows, menus, keyboard behavior, sandbox, distribution, and manual release checks.

## Exit criteria

A real existing app can complete: read-only audit, adoption acknowledgement, one planned maintenance change, source-bound verification, review, handoff, and a learning record tied to an explicit metric or feedback source.
