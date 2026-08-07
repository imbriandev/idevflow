#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createPrivateKey, sign } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const [action, ...args] = process.argv.slice(2);
const key = process.env.APP_CONNECT_KEY;
const keyId = process.env.APPSTORE_KEY_ID;
const issuerId = process.env.APPSTORE_ISSUER_ID;
if (!key || !keyId || !issuerId || !action) process.exitCode = 64;
else if (action === "upload") {
  const [ipaPath] = args;
  if (!ipaPath) process.exitCode = 64;
  else {
    const directory = await mkdtemp(join(tmpdir(), "idevflow-appstore-"));
    try {
      await writeFile(join(directory, `AuthKey_${keyId}.p8`), key, { mode: 0o600 });
      const child = spawn("xcrun", ["altool", "--upload-package", ipaPath, "--type", "ios", "--api-key", keyId, "--api-issuer", issuerId, "--wait"], { env: { ...process.env, API_PRIVATE_KEYS_DIR: directory }, stdio: "inherit" });
      process.exitCode = await new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 1)));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
} else {
  const encode = (input) => Buffer.from(input).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${encode(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.${encode(JSON.stringify({ iss: issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }))}`;
  const request = async (path, options = {}) => {
    const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, { ...options, headers: { Authorization: `Bearer ${jwt}.${signature.toString("base64url")}`, ...(options.body ? { "Content-Type": "application/json" } : {}) } });
    if (!response.ok) throw new Error(`App Store Connect request failed (${response.status})`);
    return response.status === 204 ? undefined : response.json();
  };
  const appForBundle = async (bundleId) => {
    const apps = await request(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`);
    const app = apps.data?.[0];
    if (!app) throw new Error(`No App Store Connect app exists for ${bundleId}`);
    return app;
  };
  const purchaseForProduct = async (app, productId) => {
    if (!productId) throw new Error("IAP pricing requires productId");
    const purchases = await request(`/v1/apps/${app.id}/inAppPurchasesV2?filter[productId]=${encodeURIComponent(productId)}&limit=1`);
    const purchase = purchases.data?.[0];
    if (!purchase) throw new Error(`No in-app purchase exists for ${productId}`);
    return purchase;
  };
  const ownerFor = async (scope, bundleId, productId) => {
    if (scope !== "app" && scope !== "iap") throw new Error("Pricing scope must be app or iap");
    const app = await appForBundle(bundleId);
    return { app, ...(scope === "iap" ? { purchase: await purchaseForProduct(app, productId) } : {}) };
  };
  const scheduleFor = async (scope, owner) => request(scope === "app"
    ? `/v1/apps/${owner.app.id}/appPriceSchedule?include=manualPrices&limit[manualPrices]=200`
    : `/v2/inAppPurchases/${owner.purchase.id}/iapPriceSchedule?include=manualPrices&limit[manualPrices]=200`);
  const priceFields = (scope) => ({
    priceType: scope === "app" ? "appPrices" : "inAppPurchasePrices",
    pricePointType: scope === "app" ? "appPricePoints" : "inAppPurchasePricePoints",
    pricePointRelationship: scope === "app" ? "appPricePoint" : "inAppPurchasePricePoint",
    scheduleType: scope === "app" ? "appPriceSchedules" : "inAppPurchasePriceSchedules",
    ownerRelationship: scope === "app" ? "app" : "inAppPurchase",
  });
  const manualPrices = (scope, schedule) => {
    const { priceType, pricePointRelationship } = priceFields(scope);
    return (schedule.included ?? []).filter((item) => item.type === priceType).map((item) => ({
      id: item.id,
      ...(item.relationships?.[pricePointRelationship]?.data?.id ? { pricePointId: item.relationships[pricePointRelationship].data.id } : {}),
      ...(item.attributes?.startDate ? { startDate: item.attributes.startDate } : {}),
      ...(item.attributes?.endDate ? { endDate: item.attributes.endDate } : {}),
    }));
  };
  const completeManualPrices = (scope, schedule) => {
    const prices = manualPrices(scope, schedule);
    const relationship = schedule.data?.relationships?.manualPrices;
    if (!schedule.data?.id || !relationship || !Array.isArray(relationship.data) || relationship.links?.next || relationship.data.length !== prices.length) throw new Error("Cannot read the complete manual price schedule; no change was made");
    return prices;
  };
  const pricingStatus = async (scope, bundleId, productId) => {
    const owner = await ownerFor(scope, bundleId, productId);
    const schedule = await scheduleFor(scope, owner);
    const baseTerritory = schedule.data?.relationships?.baseTerritory?.data?.id;
    return { bundleId, scope, ...(productId ? { productId } : {}), ...(schedule.data?.id ? { scheduleId: schedule.data.id } : {}), ...(baseTerritory ? { baseTerritory } : {}), manualPrices: manualPrices(scope, schedule) };
  };
  const replacementPayload = (scope, owner, schedule, prices) => {
    const current = completeManualPrices(scope, schedule);
    const baseTerritory = schedule.data.relationships.baseTerritory?.data?.id;
    if (!baseTerritory) throw new Error("App Store Connect returned no base territory; no change was made");
    const { priceType, pricePointType, pricePointRelationship, scheduleType, ownerRelationship } = priceFields(scope);
    const replacement = prices.map((price, index) => {
      if (!price.pricePointId || !price.startDate) throw new Error(`Cannot preserve manual price ${price.id}; no change was made`);
      const id = `manual-price-${index}`;
      return { id, type: priceType, attributes: { startDate: price.startDate, ...(price.endDate ? { endDate: price.endDate } : {}) }, relationships: { [pricePointRelationship]: { data: { type: pricePointType, id: price.pricePointId } } } };
    });
    if (replacement.length < current.length - 1 || replacement.length > current.length + 1) throw new Error("Invalid manual price replacement; no change was made");
    return {
      data: { type: scheduleType, relationships: {
        [ownerRelationship]: { data: { type: scope === "app" ? "apps" : "inAppPurchases", id: scope === "app" ? owner.app.id : owner.purchase.id } },
        baseTerritory: { data: { type: "territories", id: baseTerritory } },
        manualPrices: { data: replacement.map(({ id, type }) => ({ id, type })) },
      } },
      included: replacement,
    };
  };
  try {
    if (action === "status") {
      const [bundleId] = args;
      const apps = await request(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`);
      const app = apps.data?.[0];
      if (!app) console.log(JSON.stringify({ bundleId, appFound: false, inAppPurchases: [], builds: [] }));
      else {
        const [purchases, builds] = await Promise.all([
          request(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200&fields[inAppPurchases]=name,productId,state`),
          request(`/v1/apps/${app.id}/builds?limit=200&fields[builds]=version,uploadedDate,processingState,expired`),
        ]);
        console.log(JSON.stringify({ bundleId, appFound: true, inAppPurchases: (purchases.data ?? []).map((item) => ({ id: item.id, ...item.attributes })), builds: (builds.data ?? []).map((item) => item.attributes) }));
      }
    } else if (action === "create_iap") {
      const [rawInput, bundleId] = args;
      let input;
      try { input = JSON.parse(rawInput); } catch { throw new Error("Invalid IAP creation input"); }
      if (!input || !/^[A-Za-z0-9._-]{1,255}$/.test(input.productId ?? "") || typeof input.referenceName !== "string" || !input.referenceName.trim() || !["CONSUMABLE", "NON_CONSUMABLE", "NON_RENEWING_SUBSCRIPTION"].includes(input.type)) throw new Error("Invalid IAP product ID, reference name, or type");
      if ((input.locale || input.displayName || input.description) && (typeof input.locale !== "string" || typeof input.displayName !== "string" || !input.locale || !input.displayName)) throw new Error("IAP localization requires locale and displayName");
      const app = await appForBundle(bundleId);
      const existing = await request(`/v1/apps/${app.id}/inAppPurchasesV2?filter[productId]=${encodeURIComponent(input.productId)}&limit=1`);
      if (existing.data?.length) throw new Error(`An in-app purchase already exists for ${input.productId}`);
      const created = await request("/v2/inAppPurchases", { method: "POST", body: JSON.stringify({ data: { type: "inAppPurchases", attributes: { name: input.referenceName, productId: input.productId, inAppPurchaseType: input.type, ...(input.reviewNote ? { reviewNote: input.reviewNote } : {}), ...(typeof input.familySharable === "boolean" ? { familySharable: input.familySharable } : {}) }, relationships: { app: { data: { type: "apps", id: app.id } } } } }) });
      if (!created.data?.id) throw new Error("App Store Connect created the IAP but returned no identifier; inspect it by product ID before retrying");
      const result = { bundleId, product: { id: created.data.id, productId: input.productId, referenceName: input.referenceName, type: input.type } };
      if (!input.locale) console.log(JSON.stringify({ complete: true, ...result }));
      else {
        try {
          const version = await request("/v1/inAppPurchaseVersions", { method: "POST", body: JSON.stringify({ data: { type: "inAppPurchaseVersions", relationships: { inAppPurchase: { data: { type: "inAppPurchases", id: created.data.id } } } } }) });
          const localization = await request("/v2/inAppPurchaseLocalizations", { method: "POST", body: JSON.stringify({ data: { type: "inAppPurchaseLocalizations", attributes: { locale: input.locale, name: input.displayName, ...(input.description ? { description: input.description } : {}) }, relationships: { version: { data: { type: "inAppPurchaseVersions", id: version.data.id } } } } }) });
          console.log(JSON.stringify({ complete: true, ...result, localization: { id: localization.data?.id, locale: input.locale, displayName: input.displayName } }));
        } catch (error) {
          // ponytail: do not delete a newly created IAP; Apple creation is non-atomic and the founder must see the exact partial result.
          console.log(JSON.stringify({ complete: false, ...result, localization: { created: false, error: error instanceof Error ? error.message : "Localization creation failed" } }));
        }
      }
    } else if (action === "pricing_status") {
      const [scope, productId, bundleId] = args;
      console.log(JSON.stringify(await pricingStatus(scope, bundleId, productId)));
    } else if (action === "price_points") {
      const [scope, productId, territory, bundleId] = args;
      if (!/^[A-Z]{3}$/.test(territory ?? "")) throw new Error("Territory must be a three-letter App Store Connect code");
      const owner = await ownerFor(scope, bundleId, productId);
      const path = scope === "app" ? `/v1/apps/${owner.app.id}/appPricePoints` : `/v2/inAppPurchases/${owner.purchase.id}/pricePoints`;
      const points = await request(`${path}?filter[territory]=${territory}&limit=200&include=territory`);
      console.log(JSON.stringify({ bundleId, scope, ...(productId ? { productId } : {}), territory, pricePoints: (points.data ?? []).map((item) => ({ id: item.id, ...item.attributes })) }));
    } else if (action === "set_price" || action === "delete_price") {
      const priceArgs = action === "set_price" ? args : [args[0], args[1], args[2], undefined, undefined, args[3]];
      const [scope, productId, priceId, startDate, endDate, bundleId] = priceArgs;
      if (!priceId || (action === "set_price" && !startDate)) throw new Error(action === "set_price" ? "Price point and start date are required" : "Manual price ID is required");
      const owner = await ownerFor(scope, bundleId, productId);
      const schedule = await scheduleFor(scope, owner);
      const current = completeManualPrices(scope, schedule);
      const next = action === "set_price"
        ? [...current, { id: "new", pricePointId: priceId, startDate, ...(endDate ? { endDate } : {}) }]
        : current.filter((price) => price.id !== priceId);
      if (action === "delete_price" && next.length === current.length) throw new Error("Manual price does not belong to this app or in-app purchase");
      const endpoint = scope === "app" ? "/v1/appPriceSchedules" : "/v1/inAppPurchasePriceSchedules";
      await request(endpoint, { method: "POST", body: JSON.stringify(replacementPayload(scope, owner, schedule, next)) });
      console.log(JSON.stringify({ changed: action, ...(await pricingStatus(scope, bundleId, productId)), ...(action === "set_price" ? { pricePointId: priceId } : { deletedManualPriceId: priceId }) }));
    } else process.exitCode = 64;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "App Store Connect request failed");
    process.exitCode = 1;
  }
}
