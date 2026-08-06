#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createPrivateKey, sign } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const [action, value] = process.argv.slice(2);
const key = process.env.APP_CONNECT_KEY;
const keyId = process.env.APPSTORE_KEY_ID;
const issuerId = process.env.APPSTORE_ISSUER_ID;
if (!key || !keyId || !issuerId || !value) process.exitCode = 64;
else if (action === "upload") {
  const directory = await mkdtemp(join(tmpdir(), "idevflow-appstore-"));
  try {
    await writeFile(join(directory, `AuthKey_${keyId}.p8`), key, { mode: 0o600 });
    const child = spawn("xcrun", ["altool", "--upload-package", value, "--type", "ios", "--api-key", keyId, "--api-issuer", issuerId, "--wait"], { env: { ...process.env, API_PRIVATE_KEYS_DIR: directory }, stdio: "inherit" });
    process.exitCode = await new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 1)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
} else if (action === "status") {
  const encode = (input) => Buffer.from(input).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${encode(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.${encode(JSON.stringify({ iss: issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }))}`;
  const signature = sign("sha256", Buffer.from(jwt), { key: createPrivateKey(key), dsaEncoding: "ieee-p1363" });
  const request = async (path) => {
    const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, { headers: { Authorization: `Bearer ${jwt}.${signature.toString("base64url")}` } });
    if (!response.ok) throw new Error(`App Store Connect request failed (${response.status})`);
    return response.json();
  };
  try {
    const apps = await request(`/v1/apps?filter[bundleId]=${encodeURIComponent(value)}&limit=1`);
    const app = apps.data?.[0];
    if (!app) console.log(JSON.stringify({ bundleId: value, appFound: false, inAppPurchases: [], builds: [] }));
    else {
      const [purchases, builds] = await Promise.all([
        request(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200&fields[inAppPurchases]=name,productId,state`),
        request(`/v1/apps/${app.id}/builds?limit=200&fields[builds]=version,uploadedDate,processingState,expired`),
      ]);
      console.log(JSON.stringify({ bundleId: value, appFound: true, inAppPurchases: (purchases.data ?? []).map((item) => item.attributes), builds: (builds.data ?? []).map((item) => item.attributes) }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "App Store Connect request failed");
    process.exitCode = 1;
  }
} else process.exitCode = 64;
