import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { LockOwnershipError, LockTimeoutError } from "./errors.ts";

export interface FileLockOptions {
  readonly timeoutMs?: number;
  readonly staleMs?: number;
  readonly retryMs?: number;
  readonly signal?: AbortSignal;
}

interface LockOwner {
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly acquiredAt: string;
}

export interface FileLockHandle {
  readonly path: string;
  readonly owner: LockOwner;
  release(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_MS = 60_000;
const DEFAULT_RETRY_MS = 25;

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readOwner(lockPath: string): Promise<LockOwner | undefined> {
  try {
    return JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")) as LockOwner;
  } catch {
    return undefined;
  }
}

async function canReap(lockPath: string, staleMs: number): Promise<boolean> {
  let age: number;
  try {
    age = Date.now() - (await stat(lockPath)).mtimeMs;
  } catch {
    return false;
  }
  if (age <= staleMs) return false;

  const owner = await readOwner(lockPath);
  if (owner?.hostname === hostname() && processIsAlive(owner.pid)) return false;
  return true;
}

async function reapStaleLock(lockPath: string, staleMs: number): Promise<boolean> {
  if (!(await canReap(lockPath, staleMs))) return false;
  const quarantine = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, quarantine);
  } catch {
    return false;
  }
  await rm(quarantine, { recursive: true, force: true });
  return true;
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Lock acquisition aborted"));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Lock acquisition aborted"));
      },
      { once: true },
    );
  });
}

export async function acquireFileLock(
  lockPath: string,
  options: FileLockOptions = {},
): Promise<FileLockHandle> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const deadline = Date.now() + timeoutMs;
  await mkdir(dirname(lockPath), { recursive: true });

  const owner: LockOwner = {
    token: randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    acquiredAt: new Date().toISOString(),
  };

  while (true) {
    options.signal?.throwIfAborted();
    try {
      await mkdir(lockPath);
      try {
        await writeFile(join(lockPath, "owner.json"), `${JSON.stringify(owner)}\n`, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true });
        throw error;
      }

      let released = false;
      return {
        path: lockPath,
        owner,
        async release(): Promise<void> {
          if (released) return;
          const current = await readOwner(lockPath);
          if (!current || current.token !== owner.token) {
            throw new LockOwnershipError(`Refusing to release a lock no longer owned by token ${owner.token}`);
          }
          await rm(lockPath, { recursive: true });
          released = true;
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    if (await reapStaleLock(lockPath, staleMs)) continue;
    if (Date.now() >= deadline) {
      const current = await readOwner(lockPath);
      throw new LockTimeoutError(
        `Timed out acquiring ${lockPath}${current ? `; held by pid ${current.pid} on ${current.hostname}` : ""}`,
      );
    }
    await sleep(Math.min(retryMs, Math.max(1, deadline - Date.now())), options.signal);
  }
}

export async function withFileLock<T>(
  lockPath: string,
  operation: () => Promise<T>,
  options?: FileLockOptions,
): Promise<T> {
  const lock = await acquireFileLock(lockPath, options);
  try {
    return await operation();
  } finally {
    await lock.release();
  }
}
