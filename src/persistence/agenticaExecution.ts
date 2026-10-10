import type { AgenticaAction, AgenticaResult } from '../services/agentica/contracts';
import type { StreamActionResult } from '../domain/expedition/streaming/types';
import { actionFingerprint, actionKey } from '../services/agentica/sdk/agentica-host.mjs';
import { createAgenticaResult } from '../services/agentica/observation';
import { executeStreamActionInTransaction } from './streamActions';
import { snapshotAt } from './streamRepository';
import { streamControl, streamRecord } from './streamRecords';
import { topologyTransaction } from './topology/database';
import { validId } from './topology/validation';
import { agenticaActionAt, agenticaStreamRequest } from './agenticaRecords';
import { agenticaCheck, boundedJson, validateActionKey } from './agenticaValidation';
import { validateAgenticaEvidence } from './agenticaEvidence';

/**
 * Requires an already-durable SDK reservation. Only this local host may execute it;
 * reconciliation never does. No external awaits, no second commit window, no replay
 * observation regeneration. Failed transactions leave the reservation pending.
 */
export async function executeAgenticaAction(slot: string, action: AgenticaAction): Promise<AgenticaResult> {
  validId(slot); agenticaCheck(boundedJson(action, 8192) === actionFingerprint(action), 'invalid action envelope');
  const input = structuredClone(action), key = actionKey(input), fingerprint = actionFingerprint(input);
  validateActionKey(key);
  return topologyTransaction(async tx => {
    const before = await streamRecord(tx, slot);
    const retained = await agenticaActionAt(tx, slot, key, before.root, before.checkpoint);
    agenticaCheck(retained, 'missing durable pending reservation');
    agenticaCheck(retained.stored.record.fingerprint === fingerprint, 'action ID reused with different input');
    if (retained.stored.record.status === 'completed') return retained.stored.record.result!;
    const { binding, stored } = retained;
    const control = await streamControl(tx, slot), checkpoint = before.checkpoint;
    const rejected = (disposition: 'conflict' | 'unavailable', reason: string): StreamActionResult => ({
      actionId: input.actionId, disposition, beforeRevision: checkpoint.revision, afterRevision: checkpoint.revision,
      topologyRevision: checkpoint.topologyRevision, reason,
    });
    let domain: StreamActionResult | undefined;
    if (control?.sessionId !== binding.control.sessionId || control?.epoch !== binding.control.epoch) {
      domain = rejected('conflict', 'Control ownership changed.');
    } else if (checkpoint.revision !== input.expectedRevision || checkpoint.topologyRevision !== input.arguments.topologyRevision) {
      domain = rejected('conflict', 'Checkpoint or topology revision conflict.');
    } else if (Date.parse(input.deadlineAt) <= Date.now()) {
      domain = rejected('unavailable', 'Action deadline expired before execution.');
    } else {
      const request = agenticaStreamRequest(input, binding, stored.commandId);
      if (request) domain = { ...await executeStreamActionInTransaction(tx, slot, request), actionId: input.actionId };
    }
    const { root, checkpoint: after } = await streamRecord(tx, slot);
    const snapshot = await snapshotAt(tx, slot, root, after);
    const result = createAgenticaResult(input, binding, domain, snapshot);
    validateAgenticaEvidence(result, input, binding, root, after.revision);
    await tx.put('agenticaActions', [slot, key], { ...stored, record: { fingerprint, status: 'completed', result } });
    await tx.stageRoot(slot, root);
    return result;
  });
}
