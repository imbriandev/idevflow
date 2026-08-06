# Apple Release Capability Matrix

This is the source of truth for iDevFlow's Apple release authority. A successful local action is never permission to perform a later action.

| Capability | iDevFlow action | Founder confirmation | What is retained | Explicitly not done |
| --- | --- | --- | --- | --- |
| Inspect signing | `idev_apple audit` | No; read-only | Structured signing audit | Credential access, profile mutation, archive |
| Inspect App Store Connect | `idev_apple app_store_status` | No; read-only | Current app-record, IAP, and build-processing state | Remote mutation, tester selection, distribution |
| Provision a development device/profile | `idev_apple provision_device` | Required | Tool result only | Archive, export, upload, distribution |
| Verify app behavior | `idev_verify` / proof tools | Per lifecycle policy | Source-bound verification receipts | Signing, upload, distribution |
| Create release candidate | `idev_release create_candidate` | Existing lifecycle/review gates | Candidate, review and verification evidence | Promotion, signing, archive, upload |
| Promote candidate locally | `idev_release approve` then `promote` | Required, candidate-bound | Expiring approval hash and promoted candidate | Push, archive, export, upload, distribution |
| Create signed local archive | `idev_apple archive` | Required, exact promoted candidate | Candidate-bound archive receipt: path/hash, codesign authority/team, entitlement hash, signing verdict | IPA export, upload, tester selection, distribution |
| Export and upload internal TestFlight build | `idev_apple upload_testflight` | Required, exact promoted candidate | Candidate-bound IPA hash and upload receipt | Tester selection and distribution |
| Prepare TestFlight handoff | `idev_release handoff` | Required | Manual handoff package | Push, tester selection, distribution |
| Select testers/distribute | None | Separate founder operation outside iDevFlow | Founder-owned external evidence may be recorded as a resolved external blocker | No automatic remote distribution |

## Local upload credentials

Call `idev_apple setup_vault` once to install the stable `~/.config/idevflow/automic-vault/automic-app-store-connect` bridge, then approve that exact bridge with `av bless ~/.config/idevflow/automic-vault/automic-app-store-connect`. `idev_apple upload_testflight` executes only through that bridge, so project-local package paths do not affect the approval. Automic Vault injects `APP_CONNECT_KEY`, `APPSTORE_KEY_ID`, and `APPSTORE_ISSUER_ID` into that child process; it creates a temporary private-key directory for Apple tooling and removes it afterward. iDevFlow never persists those values, their paths, or their content in receipts.

## External validation

Use `idev_blocker open` with `kind=apple_developer`, `external_validation`, or `release` for sandbox-device, Apple Developer, App Store Connect, or TestFlight work. These records require a founder/coordinator owner, the evidence required to close them, and a retry action. They block candidate creation only when still open at ship time.

iDevFlow never exposes Apple credentials to prompts, receipts, or project state.
