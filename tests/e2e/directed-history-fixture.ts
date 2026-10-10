import { applyDirectedCommand } from '../../src/domain/directed/transition';
import { DIRECTED_LIMITS } from '../../src/domain/directed/types';
import { storeReceipt } from '../../src/persistence/directed/attempts';
import { transaction } from '../../src/persistence/directed/database';
import { receipt } from '../../src/persistence/directed/journalValidation';
import { requireSave } from '../../src/persistence/directed/records';
import { saveHeadWitness } from '../../src/persistence/directed/witnesses';

/** Test-only batching of actual pure refusals, with the production receipt writer. */
export async function fillDirectedReceiptCapacity(slot: string) {
  return transaction(async tx => {
    const record = await requireSave(tx, slot), current = record.session;
    if (!current.owner || record.historyMode !== 'checkpoint-v1') throw new Error('Checkpoint fixture required');
    while (record.counts.receipts < DIRECTED_LIMITS.history) {
      const request = { attemptId: `capacity-${record.counts.receipts}`, owner: current.owner, epoch: current.epoch,
        expectedRevision: current.revision, command: { type: 'interact' as const, featureId: 'not-known' } };
      const transition = applyDirectedCommand(current, request.command, 100, request.attemptId);
      if (transition.outcome.status !== 'refused' || transition.events.length || transition.observations.length) throw new Error('Expected effect-free refusal');
      const value = { request, result: transition.outcome, revision: current.revision, observationIds: [], eventIds: [] };
      receipt(value, current);
      await storeReceipt(tx, slot, record, value, false);
    }
    await tx.objectStore('saves').put(record, slot);
    await saveHeadWitness(tx, slot, record);
  });
}
