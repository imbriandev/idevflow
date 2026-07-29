# SwiftData and Swift Concurrency

Load for persistence, migrations, CloudKit, async APIs, actors, streams, task ownership, or strict-concurrency diagnostics.

## SwiftData

- Treat schema, delete rules, migration, CloudKit, and data deletion as high-risk architecture decisions.
- Make required/optional/user-generated/derived fields explicit. Define relationship inverse and delete behavior; test cascade and orphan paths.
- Keep `@Query` in SwiftUI views. Outside views use a focused model/repository boundary; never pass `ModelContext` or model instances across actors—pass identifiers and refetch.
- Save before depending on a persistent identifier; use explicit saves when timing affects user-visible correctness.
- Keep predicates to supported operations and test optional comparisons, relationship emptiness, sorts, and migration/relaunch behavior with durable fixtures.
- CloudKit-backed data is eventually consistent. Design offline, missing-sync, conflict, and recovery paths deliberately; do not assume a local fetch is globally current.

## Concurrency

- Prefer structured concurrency. Detached/unstructured tasks require explicit owner, cancellation, lifetime, and error policy.
- Re-check actor-owned assumptions after every `await`; protect shared mutable state with an actor or a proven synchronization boundary.
- Treat Sendable and actor-isolation diagnostics as design feedback. Do not silence races with `@unchecked Sendable`.
- Give view work cancellation semantics; filter expected `CancellationError` from user-facing failures. Check cancellation in CPU loops and finish streams/continuations exactly once.
- For duplicate work, consider an actor-owned in-flight task and make reentrancy intentional. Keep global/static mutable state isolated.
- Use async tests with confirmations, controllable clocks, or injected dependencies rather than sleeps.

## Evidence

For high-risk persistence/concurrency changes, record affected data/task ownership, cancellation/retry behavior, migration or relaunch coverage, and the verification receipt. A passing compile does not prove data-loss or race safety.
