# Configuration

Project configuration is stored at `.idevflow/config.json` and uses schema version 9. Prefer `idev_runtime` migration and configuration operations over manual edits during an active writer session.

A minimal configuration is:

```json
{
  "schemaVersion": 8,
  "baseBranch": "main",
  "xcode": {
    "platform": "ios",
    "requiredPlatforms": ["ios"],
    "configuration": "Debug"
  },
  "release": {
    "evidence": "internal"
  },
  "quality": {
    "requireXCTestEvidence": false,
    "performanceBudgets": {}
  }
}
```

## Xcode targets

### iOS (default)

```json
"xcode": {
  "platform": "ios",
  "requiredPlatforms": ["ios"],
  "configuration": "Debug"
}
```

An iOS simulator runtime is required for iOS verification.

### macOS

```json
"xcode": {
  "platform": "macos",
  "requiredPlatforms": ["macos"],
  "configuration": "Debug"
}
```

macOS verification uses the native Mac destination and does not acquire an iOS simulator lease.

### Universal

```json
"xcode": {
  "platform": "ios",
  "requiredPlatforms": ["ios", "macos"],
  "configuration": "Debug"
}
```

A universal verification matrix is valid only when both child receipts share the exact source fingerprint.

## Release evidence

New projects optimize for founder-approved internal TestFlight: a fresh Release build/test and simulator receipt. It does not require screenshots, accessibility audits, or performance metrics by default.

Set `release.evidence` to `"full"` for external/TestFlight or store-quality evidence. Full evidence requires non-empty screenshot variants plus XCTest accessibility and performance evidence:

```json
"release": { "evidence": "full" },
"verification": { "requiredScreenshotVariants": ["compact-light", "compact-dark"] },
"quality": {
  "requireXCTestEvidence": true,
  "performanceBudgets": { "launchTimeMs": 1200 }
}
```

Existing schema-7 projects migrate to `"full"`; upgrades never silently weaken prior release requirements. Schema-8 pipeline settings are removed during migration: one durable writer session owns delivery at a time.

## Migration behavior

Configuration migration validates the old object, saves a `.v<old>.backup` copy, atomically writes the current schema, and leaves source, branches, worktrees, receipts, and packets untouched. Unknown future schemas fail closed.

Inspect the current state with:

```text
idev_runtime status
```

See [Migration](migration.md) for legacy directory and schema behavior.
