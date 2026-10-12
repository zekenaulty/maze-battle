import type { IDBPTransaction } from 'idb';
import { observeRpg } from '../domain/agentic/knowledge/observe';
import { integer, validId } from '../domain/agentic/knowledge/shared';
import type { RpgObservation } from '../domain/agentic/knowledge/types';
import type { GameState } from '../domain/types';
import { canonicalJson } from '../services/agentica/sdk/agentica-host.mjs';
import { getDatabase, type MazeBattleDb } from './saveRepository';
import type { SaveControl } from './saveControl';
import type { RpgHistoryPage, RpgHistoryRequest, RpgObservationNode } from './observationTypes';
import { ancestorAt, ancestorIndex, observationReader, requireHistory, requireSuccessor, validateObservationNode } from './observationNodes';

type Write = IDBPTransaction<MazeBattleDb, ('saves' | 'meta' | 'observations' | 'gameCommands')[], 'readwrite'>;
const content = ({ actor, policy, cells }: RpgObservation) => canonicalJson({ actor, policy, cells });

/** Called only inside the real save/effect transaction. Never imports legacy fog as evidence. */
export async function appendRpgObservation(tx: Write, game: GameState, control: SaveControl, head?: string) {
  const store = tx.objectStore('observations'), reader = observationReader(store, game.id);
  const parent = head === undefined ? undefined : await reader.read(head);
  if (game.mode === 'town') return head;
  const observation = observeRpg(game, { id: crypto.randomUUID(), revision: control, observedAt: new Date().toISOString() });
  requireHistory(observation.status === 'observed');
  // A timer/save tick is not a fresh observation of unchanged facts.
  if (parent && content(parent.observation) === content(observation)) return head;
  const node: RpgObservationNode = { version: 1, id: observation.id, gameId: game.id,
    depth: (parent?.depth ?? 0) + 1, ancestors: await ancestorIndex(reader, parent), observation };
  if (parent) requireSuccessor(parent, node);
  await store.add(validateObservationNode(node, node.id, game.id));
  return node.id;
}

/** Internal source-history API, not an agent map dump. Cursor scope is checked against the save's head. */
export async function readRpgHistory(slotId = 'auto', request: RpgHistoryRequest = {}): Promise<RpgHistoryPage> {
  const { snapshotId, cursor, limit = 16 } = structuredClone(request);
  requireHistory(validId(slotId) && integer(limit, 1, 32) && (snapshotId === undefined || validId(snapshotId))
    && (!cursor || validId(cursor.id) && integer(cursor.depth, 1) && snapshotId !== undefined));
  const db = await getDatabase(), tx = db.transaction(['saves', 'observations'], 'readonly');
  void tx.done.catch(() => {});
  try {
    const slot = await tx.objectStore('saves').get(slotId);
    requireHistory(slot && (snapshotId === undefined || slot.observationHead === snapshotId));
    if (slot.observationHead === undefined) { requireHistory(!cursor); await tx.done; return { records: [], reads: 0 }; }
    const reader = observationReader(tx.objectStore('observations'), slot.game.id);
    const head = await reader.read(slot.observationHead);
    let node: RpgObservationNode | undefined = cursor ? await ancestorAt(reader, head, cursor.depth) : head;
    requireHistory(!cursor || node.id === cursor.id);
    const records: RpgObservationNode[] = [];
    while (node && records.length < limit) {
      records.push(node);
      const parent: RpgObservationNode | undefined = node.depth > 1 ? await reader.read(node.ancestors[0], node.depth - 1) : undefined;
      if (parent) requireSuccessor(parent, node);
      node = parent;
    }
    await tx.done;
    return { snapshotId: head.id, records, reads: reader.count(), next: node ? { id: node.id, depth: node.depth } : undefined };
  } catch (error) { try { tx.abort(); } catch { /* Already completed. */ } throw error; }
}
