import { CanonicalPages } from '../../src/persistence/canonical/pages';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical } from '../../src/persistence/canonical/read';
import { checkpointJson, gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { loadObservation } from '../../src/persistence/canonical/knowledge/evidence';
import { recordGameObservation } from '../../src/persistence/canonical/knowledge/write';
import { OBSERVATION_CHUNK_SIZE } from '../../src/persistence/canonical/knowledge/types';
import { NAVIGATION_WORK_LIMITS } from '../../src/persistence/canonical/navigation/types';
import { worldRequest } from './canonical-world-fixture';
import { dump, refusal } from './canonical-frontier.support';

/** Isolated fault injection around the real writer/native transaction, never a runtime route input. */
export async function rejectObservationProof(mode: 'storage-failure' | 'write-budget') {
  const before = await dump(), state = await readCanonical(async (pages, snapshot) => {
    const cp = gameCheckpoint(snapshot.checkpoint), anchor = cp.knowledge!;
    return loadObservation(pages, { sequence: anchor.sequence, id: anchor.id });
  });
  const originalSet = CanonicalPages.prototype.set;
  let manifestWrites = 0;
  CanonicalPages.prototype.set = async function (...args) {
    if (args[0] === 'knowledge' && args[1].startsWith('perception/observation/') && args[1].endsWith('/integrity')) {
      manifestWrites++;
      if (mode === 'storage-failure') throw new DOMException('Injected observation manifest failure', 'QuotaExceededError');
    }
    return originalSet.apply(this, args);
  };
  let result;
  try {
    const chunks = Math.ceil(state.value.cells.length / OBSERVATION_CHUNK_SIZE);
    result = await refusal(() => executeCanonical(worldRequest(state.head, 'prefix.observation-proof', {}), async tx => {
      tx.setCheckpoint(checkpointJson(await recordGameObservation(tx, gameCheckpoint(tx.head.checkpoint))));
      return null;
    }, { limits: { ...NAVIGATION_WORK_LIMITS,
      // The original chunks and header fit; the additional manifest must fail the real ledger charge.
      ...(mode === 'write-budget' ? { writes: chunks + 1 } : {}) } }));
  } finally { CanonicalPages.prototype.set = originalSet; }
  return { mode, result, manifestWrites, unchanged: before === await dump() };
}
