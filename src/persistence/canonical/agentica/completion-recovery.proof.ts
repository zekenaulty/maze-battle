import type { AgenticaAction } from '../../../services/agentica/contracts';
import { readCanonical } from '../read';
import type { OwnerFence } from '../types';
import { check, fence, sameFence } from '../validation';
import { fields } from '../roster/codec';
import { loadOriginalAction } from './actions.original';
import { readActionResultSource } from './actions.result';
import { loadDecisionClaim } from './decision.claim';
import { loadLaunchTerminal } from './launch.terminal';
import { assertBoundAction, captureOperationBinding } from './operation.binding';
import type { OperationBinding } from './operation.types';
import { successorGrantKey } from './run-grant.certificate';
import { loadRunGrant } from './run-grant.read';
import { inRecoveryDatabase } from './recovery.database';
import type { PreparedAction } from './types';
import { equal, prepareAction, snapshotJson, snapshotPrepared, validateAction } from './validation';

/** Exact historical completion only, after irreversible local Stop. Never synthesizes a result or refreshes world evidence. */
export async function proveStoppedCompletion(inputFence: OwnerFence, inputParent: PreparedAction,
  inputBinding: OperationBinding, inputAction: AgenticaAction, options: { signal?: AbortSignal } = {}) {
  const expected = snapshotJson(inputFence); fence(expected);
  const parent = snapshotPrepared(inputParent), binding = captureOperationBinding(inputBinding), action = validateAction(inputAction);
  check(action.capabilityId === 'maze.inspect' && equal(action.arguments, { scope: 'objective' }), 'completion recovery requires original objective check');
  const pending = await prepareAction(action);
  return inRecoveryDatabase(options.signal, async signal => {
    const view = await readCanonical(async pages => {
      const claim = await loadDecisionClaim(pages, parent); check(claim, 'completion recovery requires original claim');
      const { decision, data: { started } } = claim, { bound } = decision.terminal;
      assertBoundAction(bound, parent, binding);
      check(equal(decision.data.binding, binding), 'completion recovery parent binding changed');
      const stop = await loadLaunchTerminal(pages, bound.launch.binding.launchId);
      const key = successorGrantKey(parent.storageKey), row = await pages.get('execution', key);
      check(row, 'completion recovery requires original successor grant');
      const grant = await loadRunGrant(pages, { key, id: row.id });
      check(equal(grant.started, started) && grant.launch.binding.launchId === bound.launch.binding.launchId
        && stop.guardId === bound.launch.guard.id && stop.admissionAttemptId === bound.launch.guard.admissionAttemptId,
      'completion recovery grant or cancellation changed');
      check(action.runId === started.runId && action.sessionId === started.sessionId && action.sessionEpoch === started.sessionEpoch
        && action.manifestHash === started.manifestHash, 'completion recovery action run changed');
      const original = await loadOriginalAction(pages, pending); check(original, 'completion recovery requires retained original');
      const input = fields(original.original.sourceRequest.input, 'action grant publication');
      check(input.action === pending.storageKey && equal(input.grant, grant.record.ref) && equal(original.original.publication, grant.record.value.data.publication)
        && equal(input.publication, original.original.publication) && original.original.effect === 'readOnly', 'completion recovery original grant changed');
      const resultKey = `${pending.storageKey}/result`, resultRow = await pages.get('execution', resultKey);
      check(resultRow, 'completion recovery requires committed result');
      const source = await readActionResultSource(pages, pending, { key: resultKey, id: resultRow.id });
      check(source.result.completion && source.result.disposition === 'applied'
        && source.sourceRequest.expected.revision + 1 <= stop.terminal.receipt.beforeRevision,
      'completion recovery requires pre-Stop committed completion');
      return source.result;
    }, { signal });
    check(sameFence(expected, view.head), 'completion recovery custody changed');
    return view.value;
  });
}
