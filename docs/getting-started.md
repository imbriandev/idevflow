# Getting started

This guide takes a trusted Apple-platform Git project from installation to its first iDevFlow session.

## Requirements

- macOS with Xcode 26 or newer
- Node.js 22 or newer
- Pi 0.82.1 or newer
- Swift 6.2 or newer
- A Git repository with a configured author identity

Check the host before starting:

```bash
node --version
xcodebuild -version
git config user.name
git config user.email
```

## Install iDevFlow

Install the beta package into Pi:

```bash
pi install npm:idevflow@beta
```

For local development instead:

```bash
cd /path/to/iDevFlow
npm ci
npm run check
pi -e . --list-models
```

## Start a project

Open the Apple-platform project in Pi and run:

```text
/idev
```

Or describe the product or change conversationally. iDevFlow initializes durable project state when the runtime tool is first used. State lives in the project at `.idevflow/`; it is local, ignored by Git, and independent of Pi conversation history.

## Founder-first operation

You do not need to know the lifecycle commands, tools, worktrees, or receipts. Run `/idev` whenever you are unsure: it explains the current checkpoint in plain language, what it protects, your available choices, and a sentence you can send to continue.

Use normal product language, for example:

```text
Help me define the smallest complete first version of this app.
Explain the plan in plain language, then let me approve or revise it.
Build the next approved slice and keep me updated in plain language.
Prepare this version for TestFlight and give me the exact remaining founder checklist.
```

Some checkpoints intentionally require your confirmation: accepting a plan, resolving completed work, promoting a beta, signing, and external distribution. They are the moments where a change would otherwise be hard to undo or could affect your Apple account. Ask “why is this paused?” at any time; the coordinator should answer without requiring technical terms.

Start with `/idev:define` for a new product or `/idev:plan` for an already-defined product.

## Existing projects

If the repository already contains an Apple-platform project, initialization intentionally remains at lifecycle `idea`. iDevFlow does not infer that existing code is defined, planned, tested, or reviewed.

The coordinator will recommend an **existing-project audit** first. Keep that audit read-only:

```text
idev_doctor audit
```

Then state the one outcome you need, for example: “Fix subscription restore.” iDevFlow records the audit snapshot and that outcome together. It does not modify source, advance lifecycle state, or grant verification/release evidence. Next, define the current product and plan only that change.

This prevents an existing codebase from receiving unearned lifecycle or release evidence.

## First safe change

The normal path is:

```text
/idev:define → /idev:plan → /idev:build → /idev:test → /idev:review → /idev:ship
```

Do not edit the source checkout directly during an active writer stage. iDevFlow creates an isolated sibling worktree, claims the paths it may change, and requires verification before the work can finish.

## Platform configuration

The default target is iOS. For macOS or universal projects, edit the project-owned `.idevflow/config.json` through `idev_runtime` rather than hand-editing state during an active session. See [Configuration](configuration.md).

## Stop and recover

Use these tools when a session is interrupted:

```text
idev_runtime status
idev_doctor status
idev_doctor report
idev_doctor repair
```

Repair is conservative: it marks expired writer sessions stale and does not delete branches, worktrees, packets, logs, or unintegrated source.

## Upgrade

```bash
pi update
```

iDevFlow migrates supported configuration schemas on request and refuses ambiguous or unsafe directory layouts. See [Migration](migration.md).
