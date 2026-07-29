import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function createGitFixture(): Promise<{ root: string; cleanup(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "pi-ios-test-"));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
  await writeFile(join(root, ".gitignore"), ".appforge/\n", "utf8");
  await writeFile(join(root, "README.md"), "# Fixture\n", "utf8");
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync(
    "git",
    ["-c", "user.name=Pi iOS Tests", "-c", "user.email=tests@example.invalid", "commit", "-m", "initial"],
    { cwd: root },
  );
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
