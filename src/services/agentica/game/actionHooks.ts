import type { AgenticaAction, AgenticaActionRecord } from '../contracts';
import type { AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { readCanonical } from '../../../persistence/canonical/read';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import { prepareAction, readAction, retainPendingAction } from '../../../persistence/canonical/agentica/actions';
import type { RetainedAction } from '../../../persistence/canonical/agentica/types';
import { equal } from '../../../persistence/canonical/agentica/validation';
import { check } from '../../../persistence/canonical/validation';
import { actionGrant, captureBinding, pinDeadline, sdkRecord, unresolved, type ActionBinding } from './actionContract';
import { executeGameAction } from './actionExecution';
import { loadGameAction, reconcileGameAction } from './actionRead';

/** Hooks for one published context. New wire revisions need an explicitly renewed publication/binding. */
export function createGameActionHooks(port: CanonicalHostPort, input: ActionBinding): Pick<AgenticaHostOptions,
  'loadAction' | 'saveAction' | 'onAction' | 'reconcileAction'> {
  const binding = captureBinding(input), fresh = new Set<string>(), signal = port.hostSignal;
  const host: CanonicalHostPort = { hostSignal: signal, submitHostCommand(command) {
    signal.throwIfAborted(); return port.submitHostCommand({ ...command, signal });
  } };
  function sameReservation(retained: RetainedAction) {
    check(equal(retained.original.publication, binding.publication)
      && retained.original.effect === (retained.original.action.capabilityId === 'maze.navigate' ? 'writesLocalState' : 'readOnly'),
    'original action publication or effect changed');
  }
  async function saveAction(key: string, value: AgenticaActionRecord) {
    const { action, record } = sdkRecord(key, value), identity = await prepareAction(action);
    const retained = (await readCanonical(pages => readAction(pages, identity))).value;
    if (retained || record.status === 'completed') {
      check(retained, 'SDK cannot manufacture a completed host effect');
      if (record.status === 'pending') sameReservation(retained);
      else check(retained.result && equal({ fingerprint: retained.original.fingerprint, status: 'completed', result: retained.result }, record),
        'SDK cannot manufacture a completed host effect');
      return;
    }
    let created = false;
    await host.submitHostCommand({ kind: 'fresh', operation: 'agentica.action.reserve',
      input: { action: identity.storageKey, grant: { ...binding.grant }, publication: { ...binding.publication } },
      execute: (input, options) => {
        const request = pinDeadline(input, action);
        return executeCanonical(request, async tx => {
          const existing = await readAction(tx.pages, identity);
          if (existing) { sameReservation(existing); return { reserved: false }; }
          const grant = await actionGrant(tx, binding, action);
          const retained = await retainPendingAction(tx, request, identity, binding.publication, grant.capability.effect);
          created = true; return retained.receipt;
        }, options);
      } });
    // Only the invocation that committed a new reservation can execute, once, in this lifetime.
    if (created && !signal.aborted) fresh.add(identity.fingerprint);
  }
  async function onAction(value: AgenticaAction) {
    const identity = await prepareAction(value), original = (await readCanonical(pages => readAction(pages, identity))).value;
    if (original?.result) return original.result;
    if (!original || !fresh.delete(identity.fingerprint)) return unresolved(identity.action);
    signal.throwIfAborted();
    await executeGameAction(host, binding, identity);
    return (await readCanonical(pages => readAction(pages, identity))).value?.result ?? unresolved(identity.action);
  }
  return { loadAction: loadGameAction, saveAction, onAction, reconcileAction: reconcileGameAction };
}
