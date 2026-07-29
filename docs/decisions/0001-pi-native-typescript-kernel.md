# ADR-0001: Pi-native TypeScript kernel

- Status: Accepted
- Date: 2026-07-29

## Context

The reference AppForge implementation combines stage guidance with a substantial Python runtime. The new product must be a complete Pi extension suitable for daily iOS development, not a compatibility wrapper.

## Decision

Implement a ground-up TypeScript kernel as a Pi package. Use Pi extension APIs for commands, tools, lifecycle interception, state mirrors, approvals, and TUI. Use Pi Skills for progressively disclosed iOS expertise. Run concurrent workers as isolated Pi processes in kernel-created Git worktrees.

The final package has no Python runtime dependency.

## Consequences

- Existing behavior is treated as a specification source, not imported architecture.
- Deterministic safety and release rules remain outside prompts.
- Project workflow state survives Pi session changes.
- Packaging, testing, and runtime dependencies align with Pi.
- Cutover requires behavioral parity and real Xcode end-to-end evidence before removing the reference implementation from consideration.
