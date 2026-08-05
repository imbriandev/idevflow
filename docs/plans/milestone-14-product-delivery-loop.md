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

The audit inventories Apple-project markers, root test directories, GitHub/GitLab/Fastlane automation markers, and root privacy/StoreKit release inputs without reading source into durable state. A future deep audit may add discovered scheme/target and dependency inventory.

## M14b — Maintenance loop

Delivered:

- A `testflight_handoff` routes to maintenance instead of implying that a new product definition is required.
- `idev_lifecycle start_maintenance` requires interactive confirmation and a user-visible issue/change reason.
- The operation returns lifecycle to `defined`, retaining the current product definition but requiring a new plan approval before implementation.

This is deliberately not an emergency bypass. A hotfix may have a narrow plan, but it still needs source-bound verification and review.

## M14c — Primary-flow quality contract

Delivered:

- Work-graph schema 3 requires every new slice to declare a quality contract.
- A primary-flow contract requires first-run, empty, loading, failure, permission, cancellation, recovery, and visual-review coverage.
- The plan and review skills require the contract to be converted into acceptance, source-bound visual evidence, and explicit unaudited gaps.
- Legacy work-graph schemas remain readable; trivial slices can declare `primaryFlow: false`.

## M14d — Visual and device-quality review

Delivered baseline:

- Primary-flow plans require visual-review intent and reviews must name unaudited device-only, remote-service, localization, and performance gaps.
- Existing source-bound screenshot, accessibility, and performance receipts remain the evidence mechanism; no self-attested visual pass is added.

## M14e — Measured learning and macOS parity

Delivered baseline:

- Metric learning evidence requires a named metric, finite observed value, unit, target, source, finding, and claim linkage.
- Add macOS product-experience guidance covering windows, menus, keyboard paths, focus, sandbox, and native-destination verification.
- Context selection recognizes macOS surfaces; plan, build, test, review, and release guidance now call out macOS-specific behavior and manual distribution boundaries.

## Exit criteria

A real existing app can complete: read-only audit, adoption acknowledgement, one planned maintenance change, source-bound verification, review, handoff, and a learning record tied to an explicit metric or feedback source.
