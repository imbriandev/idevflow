---
name: idev-plan
description: Plan an approved indie Apple-platform product slice using SwiftUI, SwiftData, Swift Concurrency, and Swift Testing; produce architecture decisions, vertical slices, dependencies, risks, and verification strategy without implementing code.
compatibility: iDevFlow; iOS/macOS 26+, Swift 6.2+
---

# Apple-platform Plan

Convert an approved product or technical goal into an executable vertical-slice graph.

## Workflow

1. Confirm the approved spec or narrow technical goal.
2. Inspect relevant project structure, build configuration, source seams, and nearest tests.
3. Decide state ownership, navigation, persistence, concurrency boundaries, dependencies, and test seams only where the slice requires them.
4. Split work into independently verifiable user-visible slices with acceptance criteria, claimed-path candidates, and exact `platforms` (`ios`, `macos`, or both).
5. Assign risk and identify privacy, payment, signing, destructive-data, and architecture stop conditions.
6. Define focused and combined verification, including simulator and artifact needs. Universal shared-source slices require the iOS+macOS matrix.
7. Write the schema-version-3 work-graph JSON with the exact product fingerprint, accepted architecture decisions, DAG-valid slices, claims, risk, acceptance, and verification profiles. Every slice declares a quality contract; a primary flow must cover first-run, empty, loading, failure, permission, cancellation, recovery, and visual review. Verify, finish, and call `idev_lifecycle integrate`.
8. Present the frozen graph fingerprint and call `idev_lifecycle approve_plan`; implementation cannot begin until the interactive founder approval reaches `plan_approved`.

## Specialist context

Call `idev_context` before a consequential architecture decision. Mark actual surfaces: `macos`, `swiftui`, `swiftdata`, `concurrency`, `privacy`, `monetization`, `widgetkit`, or `app-intents`. For macOS work, include windows, menus, keyboard paths, sandbox, and native destination verification. Read only returned references and turn relevant checks into slice acceptance/verification requirements. Persistence, migration, CloudKit, destructive data, identity, purchase, and permission changes are high-risk planning surfaces.

## Guardrails

- Do not write production code.
- Do not hide unresolved acceptance criteria.
- Prefer narrow native architecture over speculative abstraction.
- Stop for durable architecture, privacy, payment, or scope decisions.

## Output

Report architecture decisions, slice graph, dependencies, risk, verification commands, unresolved decisions, and approval state.
