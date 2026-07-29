# Native Integrations: App Intents, WidgetKit, and Existing Platforms

Load for App Intents, Shortcuts, Spotlight, WidgetKit, interactive editors, Core Data maintenance, or legacy UIKit boundaries.

## App Intents and widgets

Add an App Intent or widget only when it strengthens a validated SLC job. Define authorization, privacy, parameter validation, error/recovery, and freshness behavior. Share domain calculations and formatting with the app instead of duplicating business rules.

Support only widget families that serve a real user job. Use environment-aware appearance, current widget background APIs, appropriate timeline cadence, and previews/simulator proof for every supported family. Avoid unnecessary reloads and expensive view trees.

## Existing platform code

Preserve a mature local UIKit/Core Data pattern unless a migration is explicitly approved. For Core Data, treat schema/migration/delete semantics as high risk and route architectural changes through planning. Do not introduce a wrapper or new framework merely to make code look modern.

Interactive editors need explicit presentation payload, gesture state separate from committed state, one geometry model for preview/interaction/rendering, and deliberate cancellation/reset behavior.
