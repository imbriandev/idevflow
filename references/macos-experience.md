# macOS Product Experience

Use for macOS planning, implementation, test, and review.

- Treat windows, menu commands, keyboard shortcuts, focus, drag/drop, file access, and multi-window restoration as product behavior, not desktop polish.
- Keep keyboard paths equivalent to primary pointer actions. Verify focus order, Escape/cancel, default actions, and menu enablement.
- Prefer native AppKit/SwiftUI commands, settings scenes, toolbars, and standard dialogs before custom controls.
- Review window resizing, compact layouts, Dynamic Type where relevant, VoiceOver, reduced motion, and sandbox-denied file or permission paths.
- Test the native Mac destination. Simulator screenshots do not prove menu-bar, keyboard, multi-window, file-provider, or entitlement behavior.
- For distribution, keep sandbox, Hardened Runtime, entitlements, signing, notarization, and upload as explicit manual boundaries.
