import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryDescriptor } from "./discovery.ts";
import { withFileLock } from "../state/file-lock.ts";

const RUNTIME_EXCLUDE = ".appforge/";

export async function ensureRuntimeExcluded(repository: RepositoryDescriptor): Promise<void> {
  const infoDirectory = join(repository.commonGitDirectory, "info");
  const excludePath = join(infoDirectory, "exclude");
  const lockPath = join(repository.commonGitDirectory, "pi-ios-locks", "exclude.lock");
  await mkdir(infoDirectory, { recursive: true });
  await withFileLock(lockPath, async () => {
    let content = "";
    try {
      content = await readFile(excludePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const lines = content.split(/\r?\n/).map((line) => line.trim());
    if (lines.includes(RUNTIME_EXCLUDE)) return;
    const file = await open(excludePath, "a", 0o600);
    try {
      const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
      await file.writeFile(`${prefix}${RUNTIME_EXCLUDE}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
  });
}
