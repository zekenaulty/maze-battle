import type { AgenticaAction, AgenticaActionRecord } from '../contracts';
import type { AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { readCanonical } from '../../../persistence/canonical/read';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import { prepareAction, readAction, reconcileAction, retainPendingAction } from '../../../persistence/canonical/agentica/actions';
import { prepareActionLookup, readActionByKey } from '../../../persistence/canonical/agentica/actions.lookup';
import { equal } from '../../../persistence/canonical/agentica/validation';
import { check } from '../../../persistence/canonical/validation';
import { actionGrant, captureBinding, pinDeadline, sdkRecord, unresolved, type ActionBinding } from './actionContract';
import { executeGameAction } from './actionExecution';

/** Hooks for one published context. New wire revisions need an explicitly renewed publication/binding. */
export function createGameActionHooks(port: CanonicalHostPort, input: ActionBinding): Pick<AgenticaHostOptions,
  'loadAction' | 'saveAction' | 'onAction' | 'reconcileAction'> {
  const binding = captureBinding(input), fresh = new Set<string>();
  async function loadAction(key: string) {
    const lookup = await prepareActionLookup(key);
    return (await readCanonical(pages => readActionByKey(pages, lookup))).value;
  }
  async function saveAction(key: string, value: AgenticaActionRecord) {
    const { action, record } = sdkRecord(key, value), identity = await prepareAction(action);
    const retained = (await readCanonical(pages => reconcileAction(pages, identity))).value;
    if (retained || record.status === 'completed') {
      check(retained && (record.status === 'pending' || equal(retained, record)), 'SDK cannot manufacture a completed host effect');
      return;
    }
    let created = false;
    await port.submitHostCommand({ kind: 'fresh', operation: 'agentica.action.reserve',
      input: { action: identity.storageKey, grant: { ...binding.grant }, publication: { ...binding.publication } },
      execute: (input, options) => {
        const request = pinDeadline(input, action);
        return executeCanonical(request, async tx => {
          if (await readAction(tx.pages, identity)) return { reserved: false };
          const grant = await actionGrant(tx, binding, action);
          const retained = await retainPendingAction(tx, request, identity, binding.publication, grant.capability.effect);
          created = true; return retained.receipt;
        }, options);
      } });
    // Only the invocation that committed a new reservation can execute, once, in this lifetime.
    if (created) fresh.add(identity.fingerprint);
  }
  async function onAction(value: AgenticaAction) {
    const identity = await prepareAction(value), original = (await readCanonical(pages => readAction(pages, identity))).value;
    if (original?.result) return original.result;
    if (!original || !fresh.delete(identity.fingerprint)) return unresolved(identity.action);
    await executeGameAction(port, binding, identity);
    return (await readCanonical(pages => readAction(pages, identity))).value?.result ?? unresolved(identity.action);
  }
  return { loadAction, saveAction, onAction,
    async reconcileAction(action) {
      const identity = await prepareAction(action);
      return (await readCanonical(pages => readAction(pages, identity))).value?.result ?? null;
    } };
}
