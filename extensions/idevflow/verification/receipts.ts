import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryDescriptor } from "../repository/discovery.ts";
import { writeFileAtomically } from "../state/atomic-file.ts";
import { validateArtifact } from "../artifacts/manifest.ts";
import type { VerificationReceipt } from "./types.ts";

export class VerificationReceiptStore {
  readonly directory: string;
  constructor(readonly repository: RepositoryDescriptor) {
    this.directory = join(repository.primaryRoot, ".idevflow", "receipts", "verification");
  }

  path(fingerprint: string): string {
    return join(this.directory, `${fingerprint}.json`);
  }

  async save(fingerprint: string, receipt: VerificationReceipt): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFileAtomically(this.path(fingerprint), `${JSON.stringify(receipt, null, 2)}\n`);
  }

  async validated(fingerprint: string): Promise<VerificationReceipt | undefined> {
    try {
      const receipt = JSON.parse(await readFile(this.path(fingerprint), "utf8")) as VerificationReceipt;
      if (!receipt.success || receipt.verificationFingerprint !== fingerprint) return undefined;
      if (!(await Promise.all(receipt.artifacts.map(validateArtifact))).every(Boolean)) return undefined;
      return receipt;
    } catch {
      return undefined;
    }
  }

  async reusable(fingerprint: string, maxAgeHours: number): Promise<VerificationReceipt | undefined> {
    const receipt = await this.validated(fingerprint);
    if (!receipt || receipt.reused) return undefined;
    if (Date.now() - Date.parse(receipt.finishedAt) > maxAgeHours * 3_600_000) return undefined;
    return receipt;
  }
}
