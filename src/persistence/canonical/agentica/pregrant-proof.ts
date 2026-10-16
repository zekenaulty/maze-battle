import type { AgenticaAction, AgenticaResult } from '../../../services/agentica/contracts';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { readCanonical } from '../read';
import type { OwnerFence } from '../types';
import { check, fence, sameFence } from '../validation';
import { captureOperationBinding } from './operation.binding';
import type { OperationBinding } from './operation.types';
import { loadPregrantStop } from './pregrant-proof.records';
import { inRecoveryDatabase } from './recovery.database';
import type { PreparedAction } from './types';
import { prepareAction, snapshotJson, snapshotPrepared, validateAction } from './validation';

/** Conditional no-effect proof, not an action original, observation, ACK or automatic resolver.
 * Caller supplies the service's original request; canonical evidence cannot authenticate its unsaved arguments/deadline. */
export async function provePregrantNoEffect(inputFence: OwnerFence, inputParent: PreparedAction,
  inputBinding: OperationBinding, inputAction: AgenticaAction, options: { signal?: AbortSignal } = {}): Promise<AgenticaResult> {
  const expected = snapshotJson(inputFence); fence(expected);
  const parent = snapshotPrepared(inputParent), binding = captureOperationBinding(inputBinding), action = validateAction(inputAction);
  const signal = options.signal; signal?.throwIfAborted();
  const pending = await prepareAction(action);
  return inRecoveryDatabase(signal, async signal => {
    const view = await readCanonical(pages => loadPregrantStop(pages, parent, binding, pending), { signal });
    check(sameFence(expected, view.head), 'pregrant proof owner or revision changed');
    const { cancellation, claim } = view.value;
    // Bind every input field, not merely actionKey; the service still owns the unsaved original request.
    const bytes = new TextEncoder().encode(canonicalJson({ schema: 1, kind: 'pregrant-unavailable',
      generation: expected.generation, gameId: expected.gameId, cancellation: cancellation.source.attemptId,
      claim, action: pending.fingerprint }));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    signal.throwIfAborted();
    return { actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch, disposition: 'unavailable',
      beforeRevision: cancellation.receipt.afterRevision, afterRevision: cancellation.receipt.afterRevision,
      evidenceId: `pregrant-unavailable:${digest}`, summary: 'Root cancelled before successor execution authority was granted. No host effect was performed.' };
  });
}
