import type { AgenticaAction } from '../contracts';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { canonicalFence } from '../../../persistence/canonical/transaction';
import type { OwnerFence } from '../../../persistence/canonical/types';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { provePregrantNoEffect } from '../../../persistence/canonical/agentica/pregrant-proof';
import { equal, snapshotJson, validateAction } from '../../../persistence/canonical/agentica/validation';
import { check, fence, sameFence } from '../../../persistence/canonical/validation';
import { fields } from '../../../persistence/canonical/roster/codec';
import { captureBinding, type ActionBinding } from './actionContract';
import { decisionState } from './decisionState';
import { boundedGameFetch } from './network';
import { pendingRecoveryEntry, pendingRecoveryUrl, recoveryResponse } from './pendingRecovery.wire';
import { checkPendingCustody, inPendingRecoveryDatabase, pendingRecoveryRead } from './pendingRecovery.errors';

/** Explicit single-action reconciliation after local Stop. No SDK attachment, planner, game write or ACK. */
export async function recoverPregrantAction(port: Pick<CanonicalHostPort, 'hostSignal'>, inputParent: AgenticaAction,
  inputBinding: ActionBinding, inputAction: AgenticaAction,
  options: { signal?: AbortSignal; expectedFence?: OwnerFence; fetchImpl?: typeof fetch } = {}) {
  const parent = validateAction(inputParent), binding = captureBinding(inputBinding), action = validateAction(inputAction);
  const capturedFence = options.expectedFence ? snapshotJson(options.expectedFence) : undefined;
  if (capturedFence) fence(capturedFence);
  const hostSignal = port.hostSignal, lifetime = AbortSignal.any([hostSignal, ...(options.signal ? [options.signal] : [])]);
  lifetime.throwIfAborted(); const identity = await prepareAction(parent);
  return inPendingRecoveryDatabase(lifetime, async signal => {
    const alive = () => {
      signal.throwIfAborted(); checkPendingCustody(port.hostSignal === hostSignal, 'pending recovery game lifetime changed');
    };
    const view = await pendingRecoveryRead(lifetime, async () => {
      alive(); const view = await decisionState(identity, binding); alive();
      check(!capturedFence || sameFence(capturedFence, view.head), 'pending recovery inspected fence changed'); return view;
    });
    const expected = capturedFence ?? canonicalFence(view.head), { start, launch } = view.value.terminal.bound;
    const prove = () => pendingRecoveryRead(lifetime, async () => {
      alive(); const proof = await provePregrantNoEffect(expected, identity, binding, action, { signal }); alive(); return proof;
    });
    const result = await prove(), cap = start.capabilities.find(c => c.id === action.capabilityId);
    check(cap, 'missing original recovery capability');
    const network = boundedGameFetch(signal, options.fetchImpl);
    const lookup = pendingRecoveryUrl(launch.binding.endpoint, action.sessionId, action.actionId);
    const read = async (pinned = false) => {
      alive(); const response = await network(lookup, { method: 'GET', cache: 'no-store' }); alive();
      const raw = await recoveryResponse(response); alive();
      return pendingRecoveryEntry(raw, action, start.objectiveId, cap, result, pinned);
    };
    const original = await read();
    checkPendingCustody(equal(await prove(), result), 'pregrant proof changed before recovery');
    const response = await network(pendingRecoveryUrl(launch.binding.endpoint), { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId: start.hostId, sessionId: action.sessionId, result }) });
    alive(); const reply = fields(await recoveryResponse(response), 'actionId resolved duplicate'); alive();
    check(reply.actionId === action.actionId && reply.resolved === true && typeof reply.duplicate === 'boolean', 'invalid recovery acknowledgement');
    // A lost reply can be retried from the immutable proof; success additionally requires retained exact custody.
    check(equal(await read(true), original), 'recovered service original changed');
    checkPendingCustody(equal(await prove(), result), 'pregrant proof changed during recovery');
    return { status: 'action-reconciled' as const, result, duplicate: reply.duplicate,
      rootClear: 'unknown' as const, sessionClear: 'unknown' as const };
  });
}
