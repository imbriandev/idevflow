# Specialist Context Discipline

Use `pi_ios_context` after selecting a lifecycle stage and before reading specialist material. The selector is deterministic: it maps stage, risk, task wording, and explicit surfaces to at most four references within a token budget.

## Rule

Read the stage skill, the smallest relevant source/test neighborhood, and only the returned cold-path references. A trigger grants permission to load a reference; it does not require preloading every checklist.

Expand context only for a concrete surface, a failed verification, a privacy/data-loss/release risk, or an unresolved architecture decision. State which reference was loaded and why in the final report when it materially affected a decision.

## Evidence discipline

Do not replace kernel evidence with a checklist claim. `pi_ios_verify`, proof artifacts, source fingerprints, review receipts, approvals, and integration state remain authoritative. Summarize logs by failing command, exit code, shortest useful diagnostic, and artifact path; never paste credentials or full build logs.

## Boundaries

For high/critical verification and review, selection records a durable context receipt tied to the writer session, stage, risk, selected references, and selection fingerprint. Release verification requires a separate `ship`/`critical` receipt. References still cannot expand claims, weaken profiles, alter a frozen graph, approve risk, integrate source, promote a candidate, push, upload, or distribute.
