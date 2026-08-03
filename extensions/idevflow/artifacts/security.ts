import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { containsSensitiveText } from "../process/redaction.ts";
import { SafetyKernelError } from "../state/errors.ts";

export async function assertArtifactContainsNoSecrets(path: string): Promise<void> {
  const info = await stat(path);
  if (info.isDirectory()) {
    for (const entry of await readdir(path)) await assertArtifactContainsNoSecrets(join(path, entry));
    return;
  }
  if (!info.isFile()) return;
  let overlap = "";
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    const text = overlap + (chunk as Buffer).toString("utf8");
    if (containsSensitiveText(text)) throw new SafetyKernelError(`Sensitive value detected in verification artifact ${path}`);
    overlap = text.slice(-512);
  }
}
