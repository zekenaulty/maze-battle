import type { AgenticaAction, AgenticaResult } from '../services/agentica/contracts';
import type { StreamActionResult } from '../domain/expedition/streaming/types';
import { actionFingerprint, actionKey } from '../services/agentica/sdk/agentica-host.mjs';
import { createAgenticaResult } from '../services/agentica/observation';
import { agenticaActionAt } from './agenticaRecords';
import { validateAgenticaEvidence } from './agenticaEvidence';
import { agenticaCheck, boundedJson, validateActionKey } from './agenticaValidation';
import { streamControl, streamRecord } from './streamRecords';
import { snapshotAt } from './streamRepository';
import { topologyTransaction } from './topology/database';
import { validId } from './topology/validation';

/**
 * Non-executing settlement, separate from query-only reconciliation. An exact
 * pending reservation can be closed only after a proven takeover or expiry and
 * absence of effect receipts, all under the same transaction lock. Disconnection
 * or revision drift alone is not proof. Missing/uncertain history stays pending;
 * corrupt records and storage failures reject without manufacturing evidence.
 */
export async function settleAgenticaAction(slot: string, action: AgenticaAction): Promise<AgenticaResult | undefined> {
  validId(slot);
  const fingerprint = boundedJson(action, 8192);
  agenticaCheck(actionFingerprint(action) === fingerprint, 'invalid action envelope');
  const input = structuredClone(action), key = actionKey(input);
  validateActionKey(key);
  return topologyTransaction(async tx => {
    const { root, checkpoint } = await streamRecord(tx, slot);
    const retained = await agenticaActionAt(tx, slot, key, root, checkpoint, { deferPendingReceipt: true });
    if (!retained) return undefined;
    agenticaCheck(retained.stored.record.fingerprint === fingerprint, 'action ID reused with different input');
    if (retained.stored.record.status === 'completed') return retained.stored.record.result!;
    const { binding, stored } = retained;
    if (retained.hasDomainReceipt) return undefined;
    if (input.capabilityId === 'maze.prepare' && await tx.get('receipts', [slot, stored.commandId]) !== undefined) return undefined;
    const control = await streamControl(tx, slot);
    // Successful control claims always increment the epoch, including same-owner claims.
    if (!control || control.epoch < binding.control.epoch
      || (control.epoch === binding.control.epoch && control.sessionId !== binding.control.sessionId)) return undefined;
    const revoked = control.epoch > binding.control.epoch;
    if (!revoked && Date.parse(input.deadlineAt) > Date.now()) return undefined;
    const domain: StreamActionResult = {
      actionId: input.actionId, disposition: revoked ? 'conflict' : 'unavailable',
      beforeRevision: checkpoint.revision, afterRevision: checkpoint.revision, topologyRevision: checkpoint.topologyRevision,
      reason: revoked ? 'Control ownership changed before abandoned action settlement.' : 'Action deadline expired without a committed effect.',
    };
    const result = createAgenticaResult(input, binding, domain, await snapshotAt(tx, slot, root, checkpoint));
    validateAgenticaEvidence(result, input, binding, root, checkpoint.revision);
    await tx.put('agenticaActions', [slot, key], { ...stored, record: { fingerprint, status: 'completed', result } });
    await tx.stageRoot(slot, root);
    return result;
  });
}
