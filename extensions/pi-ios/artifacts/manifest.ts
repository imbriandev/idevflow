import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ArtifactRecord } from "../verification/types.ts";

async function hashPath(path: string): Promise<{ sha256: string; bytes: number }> {
  const info = await stat(path);
  if (info.isFile()) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return { sha256: hash.digest("hex"), bytes: info.size };
  }
  const hash = createHash("sha256");
  let bytes = 0;
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = join(directory, entry.name);
      const name = relative(path, child).replace(/\\/g, "/");
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${name}\0`);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) {
        bytes += (await stat(child)).size;
        for await (const chunk of createReadStream(child)) hash.update(chunk as Buffer);
      }
    }
  }
  await visit(path);
  return { sha256: hash.digest("hex"), bytes };
}

export async function hashArtifact(path: string, kind: ArtifactRecord["kind"]): Promise<ArtifactRecord> {
  return { kind, path, ...(await hashPath(path)) };
}

export async function validateArtifact(record: ArtifactRecord): Promise<boolean> {
  try {
    const current = await hashArtifact(record.path, record.kind);
    return current.sha256 === record.sha256 && current.bytes === record.bytes;
  } catch {
    return false;
  }
}
