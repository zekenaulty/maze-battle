import { movePosition, opposite } from '../../src/domain/maze/movement';
import type { Direction, GridPosition, MazeCellState } from '../../src/domain/types';
import { materializeSpace } from '../../src/domain/expedition/schematic';
import type { CellAddress, SpaceSpec } from '../../src/domain/expedition/types';
import { overlaps, spaceBounds, world } from '../../src/domain/expedition/topology/geometry';
import { resolvedSpaceSpec } from '../../src/domain/expedition/topology/projection';
import type { TopologyConnection, TopologySpace } from '../../src/domain/expedition/topology/types';
import { enclosingBounds, footprint, roomSizes } from './streamed-footprint';
import { roomGraph } from './streamed-graph';
import { STREAMED_LIMITS } from './streamed-types';
import type { StreamedGeometry } from './streamed-types';

const cellKey = (cell: GridPosition) => `${cell.row},${cell.column}`;

const addressKey = (cell: CellAddress) => JSON.stringify([cell.spaceId, cell.row, cell.column]);

const sameCell = (a: GridPosition, b: GridPosition) => a.row === b.row && a.column === b.column;

function onBoundary(spec: SpaceSpec, cell: GridPosition, direction: Direction) {
  if (!Number.isInteger(cell.row) || !Number.isInteger(cell.column) || cell.row < 0 || cell.column < 0
    || cell.row >= spec.rows || cell.column >= spec.columns) return false;
  return direction === 'north' ? cell.row === 0 : direction === 'south' ? cell.row === spec.rows - 1
    : direction === 'west' ? cell.column === 0 : cell.column === spec.columns - 1;
}

/** Bounded snapshot inspection, also used for deterministic tiny-topology tests. */
export function inspectStreamedSnapshot(spaces: TopologySpace[], links: TopologyConnection[], start: CellAddress) {
  if (spaces.length > 2 * STREAMED_LIMITS.rooms - 1 || links.length > 4 * STREAMED_LIMITS.rooms
    || spaces.filter(value => value.spec.kind === 'room').length > STREAMED_LIMITS.rooms) {
    throw new Error('Snapshot exceeds diagnostic limits');
  }
  const byId = new Map(spaces.map(value => [value.spec.id, value.spec]));
  if (byId.size !== spaces.length || new Set(links.map(value => value.id)).size !== links.length) {
    throw new Error('Duplicate snapshot identity');
  }
  const incident = new Map(spaces.map(value => [value.spec.id, [] as TopologyConnection[]]));
  for (const link of links) {
    incident.get(link.from.spaceId)?.push(link);
    incident.get(link.to.spaceId)?.push(link);
  }
  const geometry: StreamedGeometry = { rooms: [], passages: [], connections: [] };
  const floors = new Map<string, Map<string, MazeCellState>>();
  const schematicErrors: { id: string; error: string }[] = [];
  let walkableCells = 0;
  for (const value of spaces) {
    const spec = value.spec;
    const bounds = spaceBounds(spec);
    if (![bounds.row, bounds.column, bounds.rows, bounds.columns, bounds.row + bounds.rows, bounds.column + bounds.columns]
      .every(Number.isSafeInteger) || bounds.rows < 1 || bounds.columns < 1 || bounds.rows * bounds.columns > 512) {
      throw new Error('Invalid or unbounded snapshot footprint');
    }
    geometry[spec.kind === 'room' ? 'rooms' : 'passages'].push({ id: spec.id, kind: spec.kind, ...bounds });
    try {
      if (value.schematic !== 'stone-room-v1') throw new Error('Unsupported schematic');
      const materialized = materializeSpace(resolvedSpaceSpec(value, incident.get(spec.id)!));
      floors.set(spec.id, new Map(materialized.cells.map(cell => [cellKey(cell), cell])));
      walkableCells += materialized.cells.length;
      if (walkableCells > STREAMED_LIMITS.cells) throw new Error('Physical traversal cell limit');
    } catch (error) {
      schematicErrors.push({ id: spec.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  let overlapPairs = 0;
  let overlapComparisons = 0;
  const bounds = [...geometry.rooms, ...geometry.passages];
  for (let first = 0; first < bounds.length; first++) {
    for (let second = first + 1; second < bounds.length; second++) {
      overlapComparisons++;
      if (overlaps(bounds[first], bounds[second])) overlapPairs++;
    }
  }
  let invalidConnectors = 0;
  const doors = new Map<string, CellAddress[]>();
  const usedPorts = new Set<string>();
  const addDoor = (from: CellAddress, to: CellAddress) => {
    const key = addressKey(from);
    doors.set(key, [...(doors.get(key) ?? []), to]);
  };
  for (const link of links) {
    const from = byId.get(link.from.spaceId);
    const to = byId.get(link.to.spaceId);
    if (!from || !to) { invalidConnectors++; continue; }
    const fromDoor = world(from, link.from);
    const toDoor = world(to, link.to);
    geometry.connections.push({ from: from.id, to: to.id, fromDoor, toDoor });
    const fromPort = `${addressKey(link.from)}:${link.direction}`;
    const toPort = `${addressKey(link.to)}:${opposite(link.direction)}`;
    const valid = from.id !== to.id && onBoundary(from, link.from, link.direction)
      && onBoundary(to, link.to, opposite(link.direction)) && sameCell(movePosition(fromDoor, link.direction), toDoor)
      && floors.get(from.id)?.has(cellKey(link.from)) && floors.get(to.id)?.has(cellKey(link.to))
      && !usedPorts.has(fromPort) && !usedPorts.has(toPort);
    usedPorts.add(fromPort);
    usedPorts.add(toPort);
    if (!valid) { invalidConnectors++; continue; }
    addDoor(link.from, link.to);
    addDoor(link.to, link.from);
  }
  let invalidLocalLinks = 0;
  for (const floor of floors.values()) {
    for (const cell of floor.values()) {
      for (const direction of cell.links) {
        if (!floor.get(cellKey(movePosition(cell, direction)))?.links.includes(opposite(direction))) invalidLocalLinks++;
      }
    }
  }
  let physicalTraversal: {
    walkableCells: number; reachedCells: number; unreachableCells: number; reachableRooms: number;
    allRoomsReachable: boolean; allCellsReachable: boolean; valid: boolean;
  } | null = null;
  if (!schematicErrors.length) {
    const queue: CellAddress[] = [];
    const seen = new Set<string>();
    const reachedSpaces = new Set<string>();
    const enqueue = (cell: CellAddress) => {
      const key = addressKey(cell);
      if (seen.has(key) || !floors.get(cell.spaceId)?.has(cellKey(cell))) return;
      seen.add(key);
      reachedSpaces.add(cell.spaceId);
      queue.push(cell);
    };
    enqueue(start);
    for (let index = 0; index < queue.length && index < STREAMED_LIMITS.cells; index++) {
      const address = queue[index];
      const floor = floors.get(address.spaceId)!;
      for (const direction of floor.get(cellKey(address))!.links) {
        const target = movePosition(address, direction);
        if (floor.get(cellKey(target))?.links.includes(opposite(direction))) enqueue({ spaceId: address.spaceId, ...target });
      }
      for (const target of doors.get(addressKey(address)) ?? []) enqueue(target);
    }
    const reachableRooms = geometry.rooms.filter(room => reachedSpaces.has(room.id)).length;
    physicalTraversal = { walkableCells, reachedCells: seen.size, unreachableCells: walkableCells - seen.size,
      reachableRooms, allRoomsReachable: reachableRooms === geometry.rooms.length,
      allCellsReachable: seen.size === walkableCells,
      valid: seen.size > 0 && seen.size === walkableCells && invalidConnectors === 0 && invalidLocalLinks === 0 && overlapPairs === 0 };
  }
  const straightPassages = geometry.passages.every(value => Math.min(value.rows, value.columns) === 1);
  return {
    geometry,
    roomGraph: roomGraph(spaces, links, start),
    roomSizes: roomSizes(geometry.rooms, start.spaceId),
    roomFootprint: footprint(geometry.rooms),
    passageFootprint: { ...footprint(geometry.passages),
      lengthCells: straightPassages ? geometry.passages.reduce((sum, value) => sum + Math.max(value.rows, value.columns), 0) : null,
      internalSteps: straightPassages ? geometry.passages.reduce((sum, value) => sum + Math.max(value.rows, value.columns) - 1, 0) : null },
    spaceBounds: enclosingBounds(bounds),
    validation: { overlapPairs, overlapComparisons, nonOverlapping: overlapPairs === 0,
      invalidConnectors, connectorsValid: invalidConnectors === 0, invalidLocalLinks,
      schematicErrorCount: schematicErrors.length, schematicErrors: schematicErrors.slice(0, 16) },
    physicalTraversal,
  };
}
