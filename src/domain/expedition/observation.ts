import { movePosition } from '../maze/movement';
import { addressKey } from './address';
import type { ExpeditionCheckpoint, ExpeditionObservation, SpaceGeometry, SpaceSpec } from './types';

export const EXPEDITION_VISION = 4;

export function observeExpedition(checkpoint: ExpeditionCheckpoint, spec: SpaceSpec, geometry: SpaceGeometry): ExpeditionObservation {
  if (checkpoint.position.spaceId !== spec.id || geometry.spaceId !== spec.id) throw new Error('Observation space mismatch.');
  const cells = new Map(geometry.cells.map(cell => [`${cell.row}:${cell.column}`, cell]));
  const queue = [{ ...checkpoint.position, distance: 0 }];
  const seen = new Set([`${checkpoint.position.row}:${checkpoint.position.column}`]);
  const visibleCells: ExpeditionObservation['visibleCells'] = [];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const cell = cells.get(`${current.row}:${current.column}`);
    if (!cell) continue;
    visibleCells.push({ spaceId: spec.id, row: cell.row, column: cell.column, links: [...cell.links], observedAt: checkpoint.revision });
    if (current.distance >= EXPEDITION_VISION) continue;
    for (const direction of cell.links) {
      const next = movePosition(cell, direction);
      const key = `${next.row}:${next.column}`;
      if (seen.has(key) || !cells.has(key)) continue;
      seen.add(key);
      queue.push({ ...next, spaceId: spec.id, distance: current.distance + 1 });
    }
  }
  return {
    version: 1, worldId: checkpoint.worldId, floorId: checkpoint.floorId, scopeId: checkpoint.scopeId,
    revision: checkpoint.revision, position: { ...checkpoint.position }, phase: checkpoint.phase,
    visibleCells,
    visibleOpenings: spec.openings.filter(port => seen.has(`${port.cell.row}:${port.cell.column}`)).map(port => ({
      id: port.id, spaceId: spec.id, ...port.cell, direction: port.direction, observedAt: checkpoint.revision,
      ...(checkpoint.knowledge.openings[port.id]?.destination ? { destination: { ...checkpoint.knowledge.openings[port.id].destination! } } : {}),
    })),
    visibleChests: spec.chests.filter(chest => seen.has(`${chest.cell.row}:${chest.cell.column}`)).map(chest => ({
      id: chest.id, spaceId: spec.id, ...chest.cell, opened: checkpoint.openedChestIds.includes(chest.id), observedAt: checkpoint.revision,
    })),
  };
}

export function rememberObservation(checkpoint: ExpeditionCheckpoint, observation: ExpeditionObservation): ExpeditionCheckpoint {
  if (checkpoint.worldId !== observation.worldId || checkpoint.floorId !== observation.floorId
    || checkpoint.scopeId !== observation.scopeId || checkpoint.revision !== observation.revision) throw new Error('Observation identity or revision mismatch.');
  const knowledge = {
    cells: { ...checkpoint.knowledge.cells }, openings: { ...checkpoint.knowledge.openings }, chests: { ...checkpoint.knowledge.chests },
  };
  for (const cell of observation.visibleCells) knowledge.cells[addressKey(cell)] = { ...cell, links: [...cell.links] };
  for (const port of observation.visibleOpenings) knowledge.openings[port.id] = { ...port, ...(port.destination ? { destination: { ...port.destination } } : {}) };
  for (const chest of observation.visibleChests) knowledge.chests[chest.id] = { ...chest };
  return { ...checkpoint, knowledge };
}
