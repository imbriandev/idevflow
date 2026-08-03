# Installation and upgrade

This page is retained as a short compatibility link for older references. Use [Getting started](getting-started.md) for the complete setup guide.

## Install from npm

```bash
pi install npm:idevflow@beta
```

## Run a local checkout

```bash
cd /path/to/iDevFlow
npm ci
npm run check
pi -e . --list-models
```

For project initialization, platform configuration, upgrades, and recovery, see:

- [Getting started](getting-started.md)
- [Configuration](configuration.md)
- [Migration](migration.md)
- [Troubleshooting](troubleshooting.md)
