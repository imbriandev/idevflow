# Release and TestFlight Readiness

Load for `/ios:ship`, release metadata, TestFlight readiness, or a candidate Go/No-Go decision. TestFlight is the default target; App Store production is outside this extension’s automatic authority.

## Go/No-Go

Confirm the exact integrated commit, review verdict, fresh non-reused release receipt, xcresults/test summary, screenshot variants, accessibility/performance proof, privacy decision, monetization status, version/build/bundle match, known issues, and feedback channel.

Block on unresolved critical/high privacy or security findings, missing primary flow evidence, invalid artifacts, stale source/config/toolchain proof, required purchase/restore evidence gaps, or a candidate whose integration commit moved.

## Manual boundary

Candidate approval is expiring, single-use, and commit/target-bound. Local promotion does not push Git, archive/export an IPA, authenticate to App Store Connect, upload, submit, or distribute to testers. The handoff must say these operations remain manual next steps.

For a production App Store request, stop and obtain an explicit separate plan/approval covering storefront metadata, screenshots, privacy nutrition labels, pricing/IAP, review notes, rollout, and rollback/mitigation. Do not reinterpret a TestFlight approval as production authority.

## Output

Report Go/No-Go, exact candidate and target, source/verification evidence, data/trust summary, monetization state, blockers/accepted risks, known issues, and the manual handoff steps. Never call an app “shipped” when only the local handoff package exists.
