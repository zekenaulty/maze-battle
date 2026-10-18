import { inRecoveryDatabase } from '../../../persistence/canonical/agentica/recovery.database';

/** The inspected local authority is no longer usable; refresh instead of retrying its selection. */
export class PendingRecoveryInvalidatedError extends Error {
  readonly code = 'pending-recovery.invalidated';
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Pending recovery custody is invalid.', { cause });
    this.name = 'PendingRecoveryInvalidatedError';
  }
}
export function isPendingRecoveryInvalidated(error: unknown): error is PendingRecoveryInvalidatedError {
  return error instanceof PendingRecoveryInvalidatedError;
}
export function checkPendingCustody(condition: unknown, message: string): asserts condition {
  if (!condition) throw new PendingRecoveryInvalidatedError(new Error(message));
}

/** Only local reads/validation belong here, never HTTP, response parsing or recovery POST. */
export async function pendingRecoveryRead<T>(lifetime: AbortSignal, read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (lifetime.aborted || isPendingRecoveryInvalidated(error)) throw error;
    throw new PendingRecoveryInvalidatedError(error);
  }
}

export async function inPendingRecoveryDatabase<T>(lifetime: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  let entered = false, failed = false, heldSignal: AbortSignal | undefined;
  try {
    return await inRecoveryDatabase(lifetime, async signal => {
      entered = true; heldSignal = signal;
      try { return await work(signal); }
      catch (error) { failed = true; throw error; }
    });
  } catch (error) {
    if (lifetime.aborted || isPendingRecoveryInvalidated(error)) throw error;
    // Open/final guard failures and its exact schema-abort reason are local. An unrelated
    // callback failure stays uncertain even when a schema change happened concurrently.
    if (!entered || !failed || heldSignal?.aborted && error === heldSignal.reason)
      throw new PendingRecoveryInvalidatedError(error);
    throw error;
  }
}
