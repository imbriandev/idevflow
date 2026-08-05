import { readFile } from "node:fs/promises";

const REGISTRY_URL = "https://registry.npmjs.org/idevflow";

export interface UpdateStatus {
  readonly current: string;
  readonly available?: string;
}

type Fetch = (input: string, init?: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

async function currentVersion(): Promise<string> {
  const value = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as { version: string };
  return value.version;
}

/** Checks only iDevFlow's public npm metadata; no project data is sent. */
export async function checkForUpdate(fetcher: Fetch = fetch): Promise<UpdateStatus> {
  const current = await currentVersion();
  if (process.env.IDEVFLOW_DISABLE_UPDATE_CHECK === "1") return { current };
  const signal = AbortSignal.timeout(2_000);
  try {
    const response = await fetcher(REGISTRY_URL, { signal });
    if (!response.ok) return { current };
    const payload = await response.json() as { "dist-tags"?: { beta?: unknown } };
    const available = typeof payload["dist-tags"]?.beta === "string" ? payload["dist-tags"].beta : undefined;
    return available && available !== current ? { current, available } : { current };
  } catch { return { current }; }
}
