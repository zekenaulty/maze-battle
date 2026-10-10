import type { IDBPTransaction } from 'idb';
import { openTopologyDatabase, type TopologyDatabase } from './topology/database';
import { validId, validPublicScopeId } from './topology/validation';
import { natural, object, validAddress } from './streamValidation';
import { sameMapView, validateMapView } from './streamMapCursor';
import { StreamMapError, type StreamMapView } from './streamMapTypes';

const stores = ['roots', 'streamCheckpoints', 'streamKnowledge'] as const;
export type StreamMapTransaction = IDBPTransaction<TopologyDatabase, typeof stores, 'readonly'>;
interface MapFence { view: StreamMapView; current: string; home: string }

export async function readMap<T>(slot: string, expected: StreamMapView | undefined,
  read: (tx: StreamMapTransaction, fence: MapFence) => Promise<T>): Promise<T> {
  try { validId(slot); } catch { throw new StreamMapError('INVALID_REQUEST'); }
  if (expected !== undefined) validateMapView(expected);
  const db = await openTopologyDatabase();
  try {
    const tx = db.transaction(stores, 'readonly');
    try {
      const roots = await tx.objectStore('roots').getAll(slot, 1);
      if (!roots.length) throw new StreamMapError('MISSING_SLOT');
      const root = roots[0];
      // Only public identity metadata is inspected, never header/recipe/topology.
      if (!object(root) || root.streamVersion !== 1) throw new StreamMapError('CORRUPT_RECORD');
      if (!Object.hasOwn(root, 'publicScopeId')) throw new StreamMapError('PUBLIC_SCOPE_REQUIRED');
      try { validPublicScopeId(root.publicScopeId); } catch { throw new StreamMapError('CORRUPT_RECORD'); }
      const checkpoints = await tx.objectStore('streamCheckpoints').getAll([slot], 1);
      const checkpoint = checkpoints[0];
      try {
        if (!object(checkpoint) || checkpoint.version !== 2 || !natural(checkpoint.revision)
          || !natural(checkpoint.topologyRevision) || checkpoint.topologyRevision > checkpoint.revision) throw new Error();
        validAddress(checkpoint.position); validAddress(checkpoint.home);
      } catch { throw new StreamMapError('CORRUPT_RECORD'); }
      const view = { scopeId: root.publicScopeId, revision: checkpoint.revision, topologyRevision: checkpoint.topologyRevision };
      if (expected !== undefined && !sameMapView(view, expected)) throw new StreamMapError('STALE_VIEW');
      const result = await read(tx, { view, current: checkpoint.position.spaceId, home: checkpoint.home.spaceId });
      await tx.done;
      return result;
    } catch (error) {
      try { tx.abort(); } catch { /* A readonly transaction may have already completed. */ }
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally { db.close(); }
}
