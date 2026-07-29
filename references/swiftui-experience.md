# SwiftUI Experience

Load for SwiftUI screens, navigation, state ownership, Dynamic Type, VoiceOver, widgets, or rendering-performance changes. Preserve established app patterns when integrating legacy code; new app guidance assumes iOS 26+ and Swift 6.2+.

## State and structure

- Keep one clear source of truth: private `@State` for view-owned transient state; `@Observable` models for shared state; durable state outside the view.
- Keep UI mutations on the main actor. Avoid new `ObservableObject`, `@Published`, `@StateObject`, `@ObservedObject`, and `@EnvironmentObject` unless compatibility makes them the smallest safe change.
- Prefer `NavigationStack`/`NavigationSplitView`, typed `navigationDestination(for:)`, payload-driven sheets, and one selected value for mutually-exclusive choices.
- Prefer `Button`, native controls, `Label`, `LabeledContent`, `ContentUnavailableView`, semantic styles, and system presentation APIs over hand-built substitutes.
- Do not use `UIScreen.main.bounds`, arbitrary fixed frames/heights, `AnyView`, or `GeometryReader` when modern layout tools express the requirement.
- Move expensive setup and async work out of `body`; use `.task()` for view-scoped cancellable work. Keep list identity stable and avoid sorting/filtering repeatedly in `body`.

## Usability and accessibility

- Use Dynamic Type-aware text, semantic foreground/background styles, light/dark/high-contrast checks, and at least 44×44pt primary hit targets.
- Include loading, empty, error, permission, success, destructive, and first-run states in the designed flow.
- Icon-only controls need meaningful labels. Mark decorative images hidden/decorative; meaningful images need descriptions.
- Do not communicate state with color alone; support Differentiate Without Color. Respect Reduce Motion and avoid delay-based animation choreography.
- Verify compact iPhone, long localized text, keyboard/safe areas, VoiceOver, and relevant modal detents.

## Performance

Treat expensive `body` work, unstable `ForEach` identity, recreated state during navigation, unnecessary widget reloads, and repeated view-tree transforms as review findings. Use lazy stacks for genuinely large collections; profile before claiming a performance improvement.

## Rendered proof

Code inspection is insufficient for a design-quality claim. Capture source-bound screenshots and inspect the primary interaction on a leased simulator; use accessibility/performance proof when the profile requires it.
