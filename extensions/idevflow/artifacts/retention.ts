import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export async function pruneExpiredDirectories(
  root: string,
  retentionDays: number,
  preserve: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || preserve.has(entry.name)) continue;
    const path = join(root, entry.name);
    if ((await stat(path)).mtimeMs >= cutoff) continue;
    await rm(path, { recursive: true, force: true });
    removed.push(path);
  }
  return removed;
}

export const pruneExpiredArtifactDirectories = pruneExpiredDirectories;
