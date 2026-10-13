import { readCanonicalHead } from '../../persistence/canonical/read';
import { operateCanonical } from '../../persistence/canonical/transaction';
import { operationInput } from '../../persistence/canonical/operationValidation';
import type { CanonicalRequest } from '../../persistence/canonical/types';
import { check, request as validateRequest, validId } from '../../persistence/canonical/validation';
import { gameRequest } from './canonicalRequests';
import type { BrowserSaveLock } from './BrowserSaveLock';

export type HostCleanup = { kind: 'cancel' | 'acknowledge'; target: { generation: string; gameId: string; operationId: string };
  terminalAttemptId?: string } | { kind: 'retry'; request: CanonicalRequest };
export class HostCleanupError extends Error {
  readonly request: CanonicalRequest;
  constructor(request: CanonicalRequest, cause: unknown) {
    super('Canonical cleanup did not confirm an outcome; reconcile its original request.', { cause });
    this.name = 'HostCleanupError'; this.request = structuredClone(request);
  }
}
export function captureHostCleanup(value: HostCleanup): HostCleanup {
  if (value.kind === 'retry') {
    const request = validateRequest(value.request), action = request.operation.slice('operation.'.length);
    check(action === 'cancel' || action === 'acknowledge', 'invalid cleanup retry');
    operationInput(request, action); return { kind: 'retry', request };
  }
  const captured = structuredClone(value);
  check((captured.kind === 'cancel' || captured.kind === 'acknowledge') && captured.target
    && Object.values(captured.target).every(validId), 'invalid cleanup target');
  check(captured.kind === 'cancel' ? captured.terminalAttemptId === undefined : validId(captured.terminalAttemptId), 'invalid cleanup terminal');
  return captured;
}

/** No callback, projection, adoption or ordinary write can become a cleanup prerequisite. */
export async function executeHostCleanup(command: HostCleanup, owner: string, lock: BrowserSaveLock, signal: AbortSignal) {
  const held = lock.held;
  try {
    const acquired = await lock.acquire(false); signal.throwIfAborted();
    check(!lock.supported || acquired, 'cleanup control unavailable');
    const { head } = await readCanonicalHead(); signal.throwIfAborted();
    const target = command.kind === 'retry' ? command.request.expected : command.target;
    check(head.owner === owner && head.generation === target.generation && head.gameId === target.gameId, 'cleanup custody changed');
    const action = command.kind === 'retry' ? command.request.operation === 'operation.cancel' ? 'cancel' : 'acknowledge' : command.kind;
    const request = command.kind === 'retry' ? command.request : gameRequest(head, `operation.${action}`, {
      operationId: command.target.operationId, ...(action === 'acknowledge' ? { terminalAttemptId: command.terminalAttemptId! } : {}) });
    try {
      const result = await operateCanonical(request, action, undefined, { signal });
      signal.throwIfAborted();
      return { ...result, request, head: result.head ?? head };
    } catch (cause) { throw new HostCleanupError(request, cause); }
  } finally { if (!held) lock.release(); }
}
