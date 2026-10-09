import { createTopology } from '../domain/expedition/topology/generation';
import type { TopologyRecipe } from '../domain/expedition/topology/types';
import { initializeStream } from '../domain/expedition/streaming/transition';
import { observeStream } from '../domain/expedition/streaming/observation';
import type { StreamCheckpoint, StreamControl } from '../domain/expedition/streaming/types';
import { stageDelta } from './topology/commit';
import { topologyTransaction, type TopologyTransaction } from './topology/database';
import { DEFAULT_TOPOLOGY_QUOTA, type TopologyRoot } from './topology/types';
import { recipeCopy, recipeScope, validId, validQuota, validRoot } from './topology/validation';
import { loadStreamRoom, requireCurrentKnowledge, savedStreamKnowledge, streamControl, streamGeometry, streamRecord } from './streamRecords';
import { validateStreamKnowledge } from './streamKnowledge';
import { validateStreamEvidence } from './streamEvidence';
import { natural, streamCheck, validateStreamCheckpoint, validateStreamControl } from './streamValidation';
import type { StreamSnapshot } from './streamTypes';

export type { StreamSnapshot, StreamGeometryReader } from './streamTypes';
export { executeStreamAction, loadStreamAction } from './streamActions';
export { ensureStreamPublicScope, getStreamPublicScope } from './streamPublicScope';

/** Reads staged gameplay in the caller's transaction; does not commit or open a DB. */
export async function snapshotAt(tx: TopologyTransaction, slot: string, root: TopologyRoot, checkpoint: StreamCheckpoint): Promise<StreamSnapshot> {
  const room = await loadStreamRoom(tx, slot, checkpoint.position.spaceId, root.header, checkpoint.revision);
  const page = requireCurrentKnowledge(checkpoint, room);
  const geometry = streamGeometry()(room.space);
  validateStreamEvidence(room, page, geometry);
  streamCheck(geometry.cells.some(cell => cell.row === checkpoint.position.row && cell.column === checkpoint.position.column), 'checkpoint is not on walkable floor');
  return { checkpoint, room, observation: observeStream(checkpoint, room, page, geometry) };
}

/** Creates gameplay and topology together. Existing topology-only slots are never adopted. */
export async function createStreamSlot(slot: string, recipe: TopologyRecipe, quotaBytes = DEFAULT_TOPOLOGY_QUOTA): Promise<StreamSnapshot> {
  validId(slot); validQuota(quotaBytes);
  const input = recipeCopy(recipe);
  return topologyTransaction(async tx => {
    const existing = await tx.get('roots', slot);
    if (existing !== undefined) {
      validRoot(existing);
      streamCheck(existing.streamVersion === 1, 'legacy/topology-only slot cannot enable gameplay; use a fresh slot');
      streamCheck(existing.header.scopeId === recipeScope(input) && existing.quotaBytes === quotaBytes, 'slot identity or quota conflict');
      const { root, checkpoint } = await streamRecord(tx, slot);
      return snapshotAt(tx, slot, root, checkpoint);
    }
    streamCheck(await tx.get('streamCheckpoints', [slot]) === undefined && await tx.get('streamControls', [slot]) === undefined, 'orphan gameplay records');
    const delta = createTopology(input);
    await stageDelta(tx, slot, delta);
    const root = await tx.stageRoot(slot, { header: delta.header, quotaBytes, serializedBytes: 0, streamVersion: 1 });
    const room = await loadStreamRoom(tx, slot, delta.header.start.spaceId, delta.header, 0);
    streamCheck(room.knowledge === undefined, 'orphan entry knowledge');
    const transition = initializeStream(delta.header, room, streamGeometry());
    validateStreamCheckpoint(transition.checkpoint, delta.header);
    streamCheck(transition.checkpoint.revision === 0 && transition.pages.length === 1, 'invalid initial transition');
    const page = transition.pages[0];
    validateStreamKnowledge(page, room.space.spec.id, 0, room);
    await tx.put('streamKnowledge', [slot, page.spaceId], page);
    await tx.put('streamCheckpoints', [slot], transition.checkpoint);
    await tx.stageRoot(slot, root);
    return snapshotAt(tx, slot, root, transition.checkpoint);
  });
}
export async function loadStreamSnapshot(slot: string): Promise<StreamSnapshot> {
  validId(slot);
  return topologyTransaction(async tx => {
    const { root, checkpoint } = await streamRecord(tx, slot);
    return snapshotAt(tx, slot, root, checkpoint);
  });
}
/** Never loads geometry, unobserved rooms, or a world-sized knowledge manifest. */
export async function readStreamKnowledge(slot: string, spaceId: string) {
  validId(slot); validId(spaceId);
  return topologyTransaction(async tx => savedStreamKnowledge(tx, slot, spaceId, (await streamRecord(tx, slot)).checkpoint.revision));
}
export async function loadStreamControl(slot: string): Promise<StreamControl | undefined> {
  validId(slot);
  return topologyTransaction(async tx => { await streamRecord(tx, slot); return streamControl(tx, slot); });
}
/** null creates only. Every successful takeover increments the epoch; no history is cleared. */
export async function claimStreamControl(slot: string, sessionId: string, expectedEpoch: number | null): Promise<StreamControl> {
  validId(slot); validId(sessionId);
  streamCheck(expectedEpoch === null || natural(expectedEpoch), 'invalid expected epoch');
  return topologyTransaction(async tx => {
    const { root } = await streamRecord(tx, slot);
    const previous = await streamControl(tx, slot);
    streamCheck(previous === undefined ? expectedEpoch === null : previous.epoch === expectedEpoch, 'control epoch conflict');
    const control = { sessionId, epoch: previous === undefined ? 0 : previous.epoch + 1 };
    validateStreamControl(control);
    await tx.put('streamControls', [slot], control);
    await tx.stageRoot(slot, root);
    return control;
  });
}
