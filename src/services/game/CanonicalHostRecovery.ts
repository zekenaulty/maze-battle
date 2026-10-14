import { readCanonicalHead } from '../../persistence/canonical/read';
import { acknowledgeCanonical, operateCanonical, replayAcknowledgement } from '../../persistence/canonical/transaction';
import type { AcknowledgementVerifier } from '../../persistence/canonical/acknowledgement';
import { operationInput } from '../../persistence/canonical/operationValidation';
import type { CanonicalRequest, JsonObject } from '../../persistence/canonical/types';
import { check, request as validateRequest, validId } from '../../persistence/canonical/validation';
import { gameRequest } from './canonicalRequests';
import type { BrowserSaveLock } from './BrowserSaveLock';

export type HostCleanup = { kind: 'cancel' | 'acknowledge'; target: { generation: string; gameId: string; operationId: string };
  terminalAttemptId?: string } | { kind: 'retry'; request: CanonicalRequest }
  | { kind: 'verified-retry'; request: CanonicalRequest; verify: AcknowledgementVerifier }
  | { kind: 'verified-ack'; target: { generation: string; gameId: string; operationId: string }; terminalAttemptId: string;
    proof: JsonObject; verify: AcknowledgementVerifier };
export interface CanonicalRecoveryPort {
  cleanupHostOperation(command: HostCleanup, signal?: AbortSignal): Promise<{ request: CanonicalRequest; receipt: import('./CanonicalHostCommand').CanonicalCommit['receipt'] }>;
}
export class HostCleanupError extends Error {
  readonly request: CanonicalRequest;
  constructor(request: CanonicalRequest, cause: unknown) {
    super('Canonical cleanup did not confirm an outcome; reconcile its original request.', { cause });
    this.name = 'HostCleanupError'; this.request = structuredClone(request);
  }
}
export function captureHostCleanup(value: HostCleanup): HostCleanup {
  if (value.kind === 'retry' || value.kind === 'verified-retry') {
    const request = validateRequest(value.request), action = request.operation.slice('operation.'.length);
    check(action === 'cancel' || action === 'acknowledge', 'invalid cleanup retry');
    const args = operationInput(request, action);
    if (value.kind === 'verified-retry') {
      check(action === 'acknowledge' && args.proof !== undefined && typeof value.verify === 'function', 'invalid verified cleanup retry');
      return { kind: 'verified-retry', request, verify: value.verify };
    }
    return { kind: 'retry', request };
  }
  const captured = value.kind === 'verified-ack' ? { ...structuredClone({ ...value, verify: undefined }), verify: value.verify } : structuredClone(value);
  check((captured.kind === 'cancel' || captured.kind === 'acknowledge' || captured.kind === 'verified-ack') && captured.target
    && Object.values(captured.target).every(validId), 'invalid cleanup target');
  check(captured.kind === 'cancel' ? captured.terminalAttemptId === undefined : validId(captured.terminalAttemptId), 'invalid cleanup terminal');
  check(captured.kind !== 'verified-ack' || typeof captured.verify === 'function', 'missing cleanup verifier');
  return captured;
}

/** Cancel has no callback. Verified ACK permits only bounded reads; neither projects, adopts or writes ordinary state. */
export async function executeHostCleanup(command: HostCleanup, owner: string, lock: BrowserSaveLock, signal: AbortSignal) {
  const held = lock.held;
  try {
    const acquired = await lock.acquire(false); signal.throwIfAborted();
    check(!lock.supported || acquired, 'cleanup control unavailable');
    const { head } = await readCanonicalHead(); signal.throwIfAborted();
    const retry = command.kind === 'retry' || command.kind === 'verified-retry';
    const target = retry ? command.request.expected : command.target;
    check(head.owner === owner && head.generation === target.generation && head.gameId === target.gameId, 'cleanup custody changed');
    const action = retry ? command.request.operation === 'operation.cancel' ? 'cancel' : 'acknowledge'
      : command.kind === 'verified-ack' ? 'acknowledge' : command.kind;
    const request = retry ? command.request : gameRequest(head, `operation.${action}`, {
      operationId: command.target.operationId, ...(action === 'acknowledge' ? { terminalAttemptId: command.terminalAttemptId! } : {}),
      ...(command.kind === 'verified-ack' ? { proof: command.proof } : {}) });
    try {
      const result = command.kind === 'verified-ack' || command.kind === 'verified-retry' ? await acknowledgeCanonical(request, command.verify, { signal })
        : command.kind === 'retry' && (request.input as JsonObject).proof !== undefined ? await replayAcknowledgement(request, { signal })
        : await operateCanonical(request, action, undefined, { signal });
      signal.throwIfAborted();
      return { ...result, request, head: result.head ?? head };
    } catch (cause) { throw new HostCleanupError(request, cause); }
  } finally { if (!held) lock.release(); }
}
