# StoreKit and Monetization

Load only for StoreKit, RevenueCat, purchases, subscriptions, paywalls, entitlements, restore, or pricing disclosure. Canopy never contacts App Store Connect or RevenueCat as part of this reference.

## Product and architecture

- State paid value and the useful free experience before implementation.
- Keep purchase/provider APIs behind an app-owned service; make entitlement ownership, identity transitions, offline behavior, and restore rules explicit.
- Do not use remote configuration, provider SDK behavior, or a paywall as an excuse to hide core product state from the app’s domain model.

## Required evidence for paid behavior

- successful purchase and entitlement unlock;
- restore purchases and identity transitions;
- cancel, pending, expiration, billing retry, revocation, and provider-outage/offline behavior where applicable;
- price, duration, renewal, restore, terms, support, and privacy disclosure;
- StoreKit Test plus sandbox or TestFlight evidence appropriate to the feature;
- deletion/support/server-notification boundaries when applicable.

Missing primary purchase or restore evidence blocks shipping. Review coercion risk and accessibility: users must understand what is paid, what renews, how to restore, and what happens after failure. Pricing/product creation, banking, tax, remote reconciliation, App Store submission, and distribution remain explicit founder operations.
