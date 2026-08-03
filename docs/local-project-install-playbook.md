# Install iDevFlow in one project

This playbook installs iDevFlow in the current Apple-platform project only. It does not install the package globally for other projects.

## 1. Open the app repository

```bash
cd /path/to/your-apple-app
git status
```

The project must be a Git repository. Read the package source before trusting or installing an extension package because Pi extensions run with system access.

## 2. Install the project-local package

Install the latest `main` revision:

```bash
pi install -l git:github.com/imbriandev/idevflow@main
```

The `-l` option writes the package entry to `.pi/settings.json` in the app repository. Repeat the command to update the project-local installation.

For reproducible work, pin a release tag instead:

```bash
pi install -l git:github.com/imbriandev/idevflow@v0.3.0-beta.2
```

## 3. Trust and load the extension

Start Pi from the app repository:

```bash
pi
```

Accept project trust when Pi asks. If Pi is already open in this folder, reload it:

```text
/reload
```

## 4. Initialize project state

Tell Pi:

```text
Initialize iDevFlow for this trusted project, then help me define my app idea.
```

iDevFlow creates local runtime state under `.idevflow/`. This state belongs to the app project, must remain Git-ignored, and is separate from the iDevFlow package source.

## 5. Start conversationally

For example:

```text
I want to build an iPhone app for freelancers who forget invoice follow-ups.
Help me validate the idea and define the smallest complete beta.
```

The coordinator recommends the safe route from durable runtime state. The `/idev:*` commands remain optional manual entry points.

## Verify

From the app repository:

```bash
pi list
```

Confirm that iDevFlow appears as a project-local package. After runtime initialization, `/idev` displays the lifecycle dashboard.

## Update

After a new revision is pushed to `main`, update the project-local package:

```bash
pi install -l git:github.com/imbriandev/idevflow@main
```

Then run `/reload` or restart Pi. Pin a tag or commit for CI, a beta release, or any reproducible environment.

## Remove from one project

```bash
pi remove -l git:github.com/imbriandev/idevflow
```

This removes only the project-local package entry. It does not remove app source or `.idevflow/` runtime history.
