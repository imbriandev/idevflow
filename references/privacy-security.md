# Privacy and Security

Load when permissions, sensitive data, credentials, logging, networking, deletion/export, entitlements, analytics, or third-party SDKs change.

## Checklist

- Collect the minimum data and request the minimum permission at the moment its user benefit is clear. Handle denial and revocation without breaking the primary flow.
- Keep secrets out of source, `UserDefaults`, `@AppStorage`, screenshots, fixtures, logs, artifacts, and model-visible prompts. Use Keychain or an existing approved secure-storage abstraction.
- Verify transport, authentication, authorization, data retention, deletion, backup, export, analytics, and SDK behavior for the touched flow.
- Keep runtime collection aligned with `PrivacyInfo.xcprivacy`, usage strings, privacy review metadata, and App Store privacy answers.
- Use synthetic accounts/data for evidence. Redact personal data and credentials before persistence.
- Treat a credible data loss, privacy leak, secret exposure, or unsafe entitlement/signing change as critical. Do not downgrade it to a known issue to meet a date.

## Required reasoning output

State the data/trust boundary, new or changed permission, storage/retention behavior, denial/recovery path, evidence inspected, and unresolved risk. The deterministic privacy gate blocks unresolved high/critical findings; this reference improves detection but cannot override that gate.
