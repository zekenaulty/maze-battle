import type { CellAddress, KnownCell, KnownChest, KnownOpening } from '../../../domain/expedition/types';
import { sameAddress } from '../../../domain/expedition/address';
import type { KnownFrontier, StreamCheckpoint, StreamKnowledgePage, StreamObservation } from '../../../domain/expedition/streaming/types';
import type { PlanningBinding, PlanningFrame, PlanningState } from './contracts';
import { validateBinding } from './protocol';

const address = (value: CellAddress): CellAddress => ({ spaceId: value.spaceId, row: value.row, column: value.column });
const cell = (value: KnownCell): KnownCell => ({ ...address(value), links: [...value.links], observedAt: value.observedAt });
const chest = (value: KnownChest): KnownChest => ({ ...address(value), id: value.id, opened: value.opened, observedAt: value.observedAt });
const frontier = (value: KnownFrontier): KnownFrontier => ({ ...address(value), id: value.id, direction: value.direction, observedAt: value.observedAt });
const opening = (value: KnownOpening): KnownOpening => ({ ...frontier(value), ...(value.destination ? { destination: address(value.destination) } : {}) });
const records = <T>(values: Record<string, T>, copy: (value: T) => T) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, copy(value)]));

/** Do not spread host records: even the internal scope ID embeds the recipe seed. */
export function projectPlanningFrame(state: PlanningState, binding: PlanningBinding, maxBytes: number): PlanningFrame {
  validateBinding(binding);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 131_072) throw new Error('Invalid planning frame byte budget');
  const source = state.checkpoint;
  const observed = state.observation;
  const page = state.knowledge;
  if (source.worldId !== binding.worldId || source.floorId !== binding.floorId
    || observed.worldId !== source.worldId || observed.floorId !== source.floorId
    || source.scopeId !== observed.scopeId || source.revision !== observed.revision
    || source.topologyRevision !== observed.topologyRevision || page.spaceId !== source.position.spaceId
    || !sameAddress(observed.position, source.position) || observed.phase !== source.phase
    || page.revision !== source.revision) throw new Error('Planning frame identity mismatch');
  if (Object.keys(page.cells).length > 225 || Object.keys(page.openings).length > 4
    || Object.keys(page.frontiers).length > 4 || Object.keys(page.chests).length > 1
    || observed.visibleCells.length > 225 || observed.visibleOpenings.length > 4
    || observed.visibleFrontiers.length > 4 || observed.visibleChests.length > 1) throw new Error('Planning frame exceeds room budget');
  const checkpoint: StreamCheckpoint = {
    version: 2, worldId: binding.worldId, floorId: binding.floorId, scopeId: binding.scopeId,
    revision: source.revision, topologyRevision: source.topologyRevision,
    position: address(source.position), home: address(source.home), phase: source.phase,
    moves: source.moves, visitedSpaces: source.visitedSpaces, clearedSpaces: source.clearedSpaces, collectedChests: source.collectedChests,
  };
  const observation: StreamObservation = {
    version: 2, worldId: binding.worldId, floorId: binding.floorId, scopeId: binding.scopeId,
    revision: observed.revision, topologyRevision: observed.topologyRevision, position: address(observed.position), phase: observed.phase,
    visibleCells: observed.visibleCells.map(cell), visibleOpenings: observed.visibleOpenings.map(opening),
    visibleChests: observed.visibleChests.map(chest), visibleFrontiers: observed.visibleFrontiers.map(frontier),
  };
  const knowledge: StreamKnowledgePage = {
    version: 1, spaceId: page.spaceId, revision: page.revision, cells: records(page.cells, cell),
    openings: records(page.openings, opening), chests: records(page.chests, chest), frontiers: records(page.frontiers, frontier),
    completedExits: [...page.completedExits], cleared: page.cleared,
    ...(page.parentOpeningId ? { parentOpeningId: page.parentOpeningId } : {}),
  };
  const result = { observationId: `${binding.scopeId}:${source.revision}`, checkpoint, observation, knowledge };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > maxBytes) throw new Error('Planning frame exceeds byte budget');
  return result;
}
