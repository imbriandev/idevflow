# Configuration

Project configuration is stored at `.idevflow/config.json` and uses schema version 7. Prefer `idev_runtime` migration and configuration operations over manual edits during an active writer session.

A minimal configuration is:

```json
{
  "schemaVersion": 7,
  "baseBranch": "main",
  "xcode": {
    "platform": "ios",
    "requiredPlatforms": ["ios"],
    "configuration": "Debug"
  },
  "quality": {
    "requireXCTestEvidence": true,
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

## Quality evidence

Release verification requires XCTest-backed quality evidence by default:

```json
"quality": {
  "requireXCTestEvidence": true,
  "performanceBudgets": {
    "launchTimeMs": 1200
  }
}
```

Use project-owned metric names and budgets. The release parser requires fresh xcresult evidence, named passing tests, XCTest APIs, measurements, and values within budget.

## Migration behavior

Configuration migration validates the old object, saves a `.v<old>.backup` copy, atomically writes the current schema, and leaves source, branches, worktrees, receipts, and packets untouched. Unknown future schemas fail closed.

Inspect the current state with:

```text
idev_runtime status
```

See [Migration](migration.md) for legacy directory and schema behavior.
