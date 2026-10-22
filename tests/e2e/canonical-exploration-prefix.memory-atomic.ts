import { CanonicalPages } from '../../src/persistence/canonical/pages';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical } from '../../src/persistence/canonical/read';
import { readDestination } from '../../src/persistence/canonical/navigation/commands';
import { NAVIGATION_WORK_LIMITS } from '../../src/persistence/canonical/navigation/types';
import { checkpointJson, gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { blockKey, localKey } from '../../src/persistence/canonical/knowledge/keys';
import { memoryIntegrityKey } from '../../src/persistence/canonical/knowledge/memory.integrity';
import { observePositionEvidence } from '../../src/persistence/canonical/knowledge/observe';
import { readKnownCells } from '../../src/persistence/canonical/knowledge/queries';
import { recordGameObservation } from '../../src/persistence/canonical/knowledge/write';
import { worldIndexDigest } from '../../src/persistence/canonical/knowledge/worldIndex.evidence';
import type { MemoryBlock } from '../../src/persistence/canonical/knowledge/types';
import type { CanonicalRecord } from '../../src/persistence/canonical/types';
import { check } from '../../src/persistence/canonical/validation';
import { json, same } from '../../src/persistence/canonical/world/records';
import { worldRequest } from './canonical-world-fixture';
import { dump, refusal } from './canonical-frontier.support';

/** Rollback-only placement in this fixture's initialized 15x15 entrance room. It never enters
 * the planner, retained route, prelude or checkpoint. Sight and memory writes are real. */
export async function rejectMemoryProof(operationId: string, mode: 'storage-failure' | 'write-budget', writeLimit?: number) {
  const before = await readDestination(operationId), beforeDb = await dump();
  const state = await readCanonical(async (pages, snapshot) => {
    const cp = gameCheckpoint(snapshot.checkpoint);
    check(cp.position.cell.spaceId === 'socket-0:room', 'Memory probe requires the original prefix room');
    const at = { level: cp.position.level, cell: { spaceId: 'entry', row: 0, column: 0 } };
    const [known] = await readKnownCells(pages, cp, [at]);
    check(known.state === 'unknown', 'Memory probe actor must be genuinely unseen');
    const sight = await observePositionEvidence(pages, at), key = blockKey(at);
    check(sight.cells.some(cell => same(cell.at, at)), 'Memory probe requires valid ordinary sight');
    return { at, key, prior: await pages.get('knowledge', key), count: sight.cells.length };
  });
  check(same(state.head, before.head) && before.value.operation.state === 'admitted'
    && before.head.allocations[operationId]?.bytes > 0, 'Memory probe requires the original funded operation');
  const limits = { ...NAVIGATION_WORK_LIMITS };
  if (mode === 'write-budget') {
    check(Number.isSafeInteger(writeLimit) && writeLimit! > 0 && writeLimit! < limits.writes, 'Invalid memory proof test write cap');
    limits.writes = writeLimit!;
  }
  const originalSet = CanonicalPages.prototype.set, originalAdd = IDBObjectStore.prototype.add;
  const proofKey = memoryIntegrityKey(state.value.key);
  let successfulSets = 0, setsBeforeProof = 0, proofAttempts = 0, proofStaged = false, staged: CanonicalRecord | undefined;
  let nativeBlockAdds = 0, nativeProofAdds = 0;
  let proof: CanonicalRecord['value'] | undefined;
  CanonicalPages.prototype.set = async function (...args) {
    if (args[0] === 'knowledge' && args[1] === proofKey) {
      proofAttempts++; setsBeforeProof = successfulSets; proof = structuredClone(args[2]);
      check(staged && staged.id !== state.value.prior?.id && (!state.value.prior || !same(staged.value, state.value.prior.value)), 'Memory block did not change');
      const cell = (staged.value as unknown as MemoryBlock).cells[localKey(state.value.at)];
      check(same(cell.at, state.value.at) && cell.source.sequence === gameCheckpoint(before.head.checkpoint).knowledge!.sequence + 1,
        'Memory probe did not stage newly observed actor evidence');
      check(same(proof, { schema: 1, recordId: staged.id, revision: staged.revision, digest: worldIndexDigest(staged.value) }),
        'Memory probe did not reach the matching complete proof');
      if (mode === 'write-budget') check(successfulSets === writeLimit, 'Memory proof write count changed before ledger exhaustion');
    }
    const row = await originalSet.apply(this, args); successfulSets++;
    if (args[0] === 'knowledge' && args[1] === state.value.key) staged = structuredClone(row);
    if (args[0] === 'knowledge' && args[1] === proofKey) proofStaged = true;
    return row;
  };
  IDBObjectStore.prototype.add = function (...args) {
    const row = args[0] as CanonicalRecord;
    if (this.name === 'records' && row.area === 'knowledge' && row.key === state.value.key) nativeBlockAdds++;
    if (this.name === 'records' && row.area === 'knowledge' && row.key === proofKey) {
      nativeProofAdds++;
      if (mode === 'storage-failure') {
        // Both requests are native and in the original transaction. The duplicate key
        // fails after the memory block and the first proof add, rolling all stores back.
        originalAdd.apply(this, args); nativeProofAdds++;
      }
    }
    return originalAdd.apply(this, args);
  };
  let result;
  const request = worldRequest(before.head, 'prefix.memory-proof', json({ operationId, at: state.value.at, mode }));
  try {
    result = await refusal(() => executeCanonical(request, async tx => {
      const cp = gameCheckpoint(tx.head.checkpoint); cp.position = structuredClone(state.value.at);
      tx.setCheckpoint(checkpointJson(await recordGameObservation(tx, cp)));
      check(mode === 'storage-failure' && proofAttempts === 1 && proofStaged, 'Memory proof injection was not reached');
      return null;
    }, { limits }));
  } finally { CanonicalPages.prototype.set = originalSet; IDBObjectStore.prototype.add = originalAdd; }
  const afterDb = await dump(), after = await readDestination(operationId);
  const targetAfter = await readCanonical((pages, snapshot) => readKnownCells(pages, gameCheckpoint(snapshot.checkpoint), [state.value.at]));
  return { mode, request, result, limits, target: state.value.at, observedCells: state.value.count,
    successfulSets, setsBeforeProof, proofAttempts, proofStaged, nativeBlockAdds, nativeProofAdds, staged, proof, targetAfter: targetAfter.value,
    database: { unchanged: beforeDb === afterDb, beforeBytes: new TextEncoder().encode(beforeDb).length,
      afterBytes: new TextEncoder().encode(afterDb).length },
    before: { head: before.head, value: before.value }, after: { head: after.head, value: after.value } };
}
