# Apple Release Capability Matrix

This is the source of truth for iDevFlow's Apple release authority. A successful local action is never permission to perform a later action.

| Capability | iDevFlow action | Founder confirmation | What is retained | Explicitly not done |
| --- | --- | --- | --- | --- |
| Inspect signing | `idev_apple audit` | No; read-only | Structured signing audit | Credential access, profile mutation, archive |
| Provision a development device/profile | `idev_apple provision_device` | Required | Tool result only | Archive, export, upload, distribution |
| Verify app behavior | `idev_verify` / proof tools | Per lifecycle policy | Source-bound verification receipts | Signing, upload, distribution |
| Create release candidate | `idev_release create_candidate` | Existing lifecycle/review gates | Candidate, review and verification evidence | Promotion, signing, archive, upload |
| Promote candidate locally | `idev_release approve` then `promote` | Required, candidate-bound | Expiring approval hash and promoted candidate | Push, archive, export, upload, distribution |
| Create signed local archive | `idev_apple archive` | Required, exact promoted candidate | Candidate-bound archive receipt: path/hash, codesign authority/team, entitlement hash, signing verdict | IPA export, App Store Connect access, upload, tester selection, distribution |
| Prepare TestFlight handoff | `idev_release handoff` | Required | Manual handoff package | Push, export, upload, distribution |
| Export/upload/select testers/distribute | None | Separate founder operation outside iDevFlow | Founder-owned external evidence may be recorded as a resolved external blocker | No App Store Connect credential handling or remote distribution by iDevFlow |

## External validation

Use `idev_blocker open` with `kind=apple_developer`, `external_validation`, or `release` for sandbox-device, Apple Developer, App Store Connect, or TestFlight work. These records require a founder/coordinator owner, the evidence required to close them, and a retry action. They block candidate creation only when still open at ship time.

Workers never receive Apple credentials or authority to call Apple, release, blocker, approval, upload, or distribution tools.
