import { sameAddress } from '../domain/expedition/address';
import type { ExpeditionCheckpoint } from '../domain/expedition/types';
import { resolvedSpaceSpec } from '../domain/expedition/topology/projection';
import type { StreamSnapshot } from '../persistence/streamRepository';

/** Rendering adapter only; the domain never receives the legacy canvas shape. */
export function streamExpeditionViewModel(snapshot: StreamSnapshot) {
  const { checkpoint, room, observation } = snapshot;
  const knowledge = room.knowledge!;
  const canvasCheckpoint: ExpeditionCheckpoint = { ...checkpoint, version: 1, knowledge,
    openedChestIds: Object.values(knowledge.chests).filter(chest => chest.opened).map(chest => chest.id) };
  const visible = new Set(observation.visibleCells.map(cell => `${cell.row}:${cell.column}`));
  const frontier = Object.values(knowledge.frontiers).filter(port => visible.has(`${port.row}:${port.column}`))
    .sort((a, b) => (Math.abs(a.row - checkpoint.position.row) + Math.abs(a.column - checkpoint.position.column))
      - (Math.abs(b.row - checkpoint.position.row) + Math.abs(b.column - checkpoint.position.column)))[0];
  return { canvasCheckpoint, spec: resolvedSpaceSpec(room.space, room.connections), frontier,
    frontiers: Object.values(knowledge.frontiers),
    chestHere: Object.values(knowledge.chests).some(chest => !chest.opened && sameAddress(chest, checkpoint.position)) };
}
