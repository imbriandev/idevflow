# Product Scope and Interface Writing

Load for SLC shaping, onboarding, user-facing copy, empty/loading/error states, localization, and accessibility wording.

## Product checks

- Name one specific target user, painful moment, current workaround, and first-session job.
- Keep one complete job rather than several partial flows. State explicit non-goals.
- Make the source of love visible in the first session: speed, clarity, privacy, craft, insight, or emotional relief.
- Define empty, loading, failure, restart, permission-denied, and destructive-action behavior when they affect the promise.
- Ask a falsifiable TestFlight question: audience, behavior to observe, success threshold, and what would disprove the bet.
- Do not add accounts, sync, dashboards, sharing, AI, analytics, or settings unless the approved primary job requires them.

## Interface writing checks

Use this decision order: clarity, then voice, then craft. For every state, say the important fact, available action, and only what the app can truthfully promise.

- Prefer specific actions (`Delete draft`, `Keep draft`) over `Yes`/`No`.
- Errors name a recovery action; avoid blame, technical internals, false certainty, and playful language in stressful states.
- Test zero/one/many values, long names, missing values, stale/offline values, and locale-formatted numbers/dates.
- Do not concatenate localized fragments or force English word order. Allow expansion, wrapping, and right-to-left layout where supported.
- Accessibility labels describe action or resulting state, not icon names. Do not repeat visible text unless the default VoiceOver result is unclear.
- Critical information must not exist only in color, animation, or transient presentation.

## Evidence

For a material copy or flow change, report the state, prior meaning, final wording/behavior, clarity rationale, and localization/accessibility risk. Rendered screenshot or simulator evidence is required for visual-fit claims.
