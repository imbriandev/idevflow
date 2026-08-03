# Migration

## Legacy runtime directories

On first use, iDevFlow can migrate one legacy runtime directory to `.idevflow/`:

- `.canopy/`
- `.pi-ios/`

The migration is atomic and preserves journals, snapshots, receipts, packets, and approvals. It refuses symbolic links and fails closed when more than one legacy/current directory exists. No retired `/canopy:*` or `canopy_*` aliases are provided.

Before upgrading, commit or back up the project and inspect the directory layout:

```bash
find . -maxdepth 1 -type d -name '.*' -print
```

After migration:

```text
idev_runtime status
idev_doctor report
```

Update project instructions and personal prompts to use `/idev:*`, `idev_*`, and `.idevflow/`.

## Configuration schemas

The current schema is version 7. iDevFlow migrates supported older schemas in order and writes a backup beside the configuration:

```text
.idevflow/config.json.v<old>.backup
```

A migration:

1. validates the input;
2. creates the backup;
3. applies the known migration path;
4. validates the result;
5. atomically replaces the configuration.

If validation fails, the old configuration remains in place. Unknown future schemas are not guessed or downgraded.

## Product namespace

The package and public namespace are now:

```text
idevflow
/idev:*
idev_*
.idevflow/
```

Legacy names may appear only in migration code, migration tests, and historical release notes.

## Rollback

Runtime migration is not a source migration. To roll back safely, stop iDevFlow, restore the backed-up runtime directory or configuration, and do not delete the original until its journals and receipts have been inspected. Never remove a writer worktree or branch as part of a routine rollback.
