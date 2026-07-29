export class SafetyKernelError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class LockTimeoutError extends SafetyKernelError {}
export class LockOwnershipError extends SafetyKernelError {}
export class JournalCorruptionError extends SafetyKernelError {}
export class RevisionConflictError extends SafetyKernelError {}
export class RepositoryDiscoveryError extends SafetyKernelError {}
export class InvalidTransitionError extends SafetyKernelError {}
