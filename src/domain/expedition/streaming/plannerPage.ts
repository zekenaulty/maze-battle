import { movePosition, opposite } from '../../maze/movement';
import { addressKey } from '../address';
import { compass, copyAddress, isAddress, isRecord } from '../explorationGraph';
import type { CellAddress, KnownCell, KnownChest, KnownOpening } from '../types';
import type { KnownFrontier, StreamCheckpoint, StreamControl, StreamKnowledgePage } from './types';

export const STREAM_PLANNER_LIMITS = Object.freeze({ cells: 512, ports: 4, batchSteps: 128, chestObjectives: 8 });

export interface StreamPlannerWork {
  auditedRecords: number;
  searches: number;
  expandedCells: number;
  examinedLinks: number;
  plans: number;
  reusedSteps: number;
  invalidations: number;
}
export function emptyWork(): StreamPlannerWork {
  return { auditedRecords: 0, searches: 0, expandedCells: 0, examinedLinks: 0, plans: 0, reusedSteps: 0, invalidations: 0 };
}

export interface PlannerPage {
  spaceId: string;
  revision: number;
  cells: Map<string, KnownCell>;
  chests: KnownChest[];
  openings: KnownOpening[];
  frontiers: KnownFrontier[];
  parentOpeningId?: string;
  completedExits: Set<string>;
  structure: string;
  unopened: string[];
}

function check(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
const natural = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
const id = (value: unknown) => typeof value === 'string' && value.length > 0;
const address = (value: unknown): value is CellAddress => isAddress(value) && value.row < 512 && value.column < 512;

export function validateInput(checkpoint: StreamCheckpoint, control: StreamControl) {
  check(isRecord(checkpoint) && checkpoint.version === 2 && address(checkpoint.position) && address(checkpoint.home)
    && [checkpoint.worldId, checkpoint.floorId, checkpoint.scopeId].every(id)
    && [checkpoint.revision, checkpoint.topologyRevision, checkpoint.moves, checkpoint.visitedSpaces,
      checkpoint.clearedSpaces, checkpoint.collectedChests].every(natural)
    && ['exploring', 'complete'].includes(checkpoint.phase), 'Invalid streaming checkpoint.');
  check(isRecord(control) && id(control.sessionId) && natural(control.epoch), 'Invalid control token.');
}

// Stop enumerating corrupt oversized records at the bound, before allocating a full key list.
function entries<T>(record: Record<string, T>, limit: number, work: StreamPlannerWork): [string, T][] {
  check(isRecord(record) && [Object.prototype, null].includes(Object.getPrototypeOf(record)), 'Invalid page records.');
  const result: [string, T][] = [];
  for (const key in record) {
    if (!Object.hasOwn(record, key)) continue;
    work.auditedRecords++;
    check(result.length < limit, 'Knowledge page exceeds planner bounds.');
    result.push([key, record[key]]);
  }
  return result.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}

/** Copy only observed fields. No page reference, canonical room, or topology is retained. */
export function readPlannerPage(page: StreamKnowledgePage, checkpoint: StreamCheckpoint, work: StreamPlannerWork): PlannerPage {
  check(isRecord(page) && page.version === 1 && page.spaceId === checkpoint.position.spaceId
    && natural(page.revision) && page.revision <= checkpoint.revision && typeof page.cleared === 'boolean', 'Invalid or stale knowledge page.');
  const cells = new Map<string, KnownCell>();
  const observed = (value: unknown): value is KnownCell => isRecord(value) && address(value)
    && value.spaceId === page.spaceId && natural(value.observedAt) && Number(value.observedAt) <= checkpoint.revision;
  for (const [key, cell] of entries(page.cells, STREAM_PLANNER_LIMITS.cells, work)) {
    check(observed(cell) && key === addressKey(cell) && Array.isArray(cell.links) && cell.links.length <= 4
      && new Set(cell.links).size === cell.links.length && cell.links.every(d => compass.includes(d)), 'Invalid observed cell.');
    for (const direction of cell.links) check(address({ ...movePosition(cell, direction), spaceId: page.spaceId }), 'Invalid local link.');
    cells.set(key, { ...copyAddress(cell), links: compass.filter(d => cell.links.includes(d)), observedAt: cell.observedAt });
  }
  check(cells.has(addressKey(checkpoint.position)), 'Current cell is not observed.');
  let unseen = false;
  for (const cell of cells.values()) {
    for (const direction of cell.links) {
      const next = cells.get(addressKey({ ...movePosition(cell, direction), spaceId: page.spaceId }));
      check(!next || next.links.includes(opposite(direction)), 'Nonreciprocal observed local link.');
      if (!next) unseen = true;
    }
  }
  check(!unseen || cells.size < STREAM_PLANNER_LIMITS.cells, 'Unseen links exceed the local cell bound.');
  const locations = new Set<string>();
  const chests = entries(page.chests, STREAM_PLANNER_LIMITS.cells, work).map(([key, chest]) => {
    check(observed(chest) && id(key) && chest.id === key && typeof chest.opened === 'boolean'
      && cells.has(addressKey(chest)) && !locations.has(addressKey(chest)), 'Invalid observed chest.');
    locations.add(addressKey(chest));
    return { ...copyAddress(chest), id: key, opened: chest.opened, observedAt: chest.observedAt };
  });
  const ports = new Set<string>();
  const port = (key: string, value: KnownFrontier | KnownOpening) => {
    check(observed(value) && id(key) && value.id === key && compass.includes(value.direction), 'Invalid observed port.');
    const cell = cells.get(addressKey(value));
    const keyAtDirection = JSON.stringify([addressKey(value), value.direction]);
    check(cell && !cell.links.includes(value.direction) && !ports.has(keyAtDirection), 'Ambiguous or unobserved port.');
    ports.add(keyAtDirection);
    return { ...copyAddress(value), id: key, direction: value.direction, observedAt: value.observedAt };
  };
  const openings = entries(page.openings, STREAM_PLANNER_LIMITS.ports, work).map(([key, value]) => {
    const result: KnownOpening = port(key, value);
    if (value.destination !== undefined) {
      check(address(value.destination) && value.destination.spaceId !== page.spaceId, 'Invalid learned destination.');
      result.destination = copyAddress(value.destination);
    }
    return result;
  });
  const frontiers = entries(page.frontiers, STREAM_PLANNER_LIMITS.ports - openings.length, work).map(([key, value]) => {
    check(!openings.some(opening => opening.id === key), 'Frontier is also an opening.');
    return port(key, value);
  });
  check(Array.isArray(page.completedExits) && page.completedExits.length <= STREAM_PLANNER_LIMITS.ports
    && new Set(page.completedExits).size === page.completedExits.length, 'Invalid completed exits.');
  for (const exit of page.completedExits) check(openings.some(port => port.id === exit && port.destination), 'Completed exit lacks a learned destination.');
  if (page.parentOpeningId !== undefined) {
    check(openings.some(port => port.id === page.parentOpeningId && port.destination)
      && !page.completedExits.includes(page.parentOpeningId) && page.spaceId !== checkpoint.home.spaceId, 'Invalid learned parent port.');
  } else check(page.spaceId === checkpoint.home.spaceId, 'Non-entry page has no learned parent port.');
  const completedExits = new Set(page.completedExits);
  const unopened = chests.filter(chest => !chest.opened).map(chest => chest.id);
  check(!page.cleared || (!unseen && unopened.length === 0 && frontiers.length === 0
    && openings.every(port => port.id === page.parentOpeningId || completedExits.has(port.id))), 'Cleared page still has observed work.');
  // Ignore only bookkeeping timestamps/revisions; in-place edits and cloned pages are equivalent.
  const structure = JSON.stringify([
    page.spaceId, [...cells].map(([key, cell]) => [key, cell.links]), chests.map(chest => [chest.id, addressKey(chest)]),
    openings.map(port => [port.id, addressKey(port), port.direction, port.destination && addressKey(port.destination)]),
    frontiers.map(port => [port.id, addressKey(port), port.direction]), page.parentOpeningId,
    [...completedExits].sort(), page.cleared,
  ]);
  return { spaceId: page.spaceId, revision: page.revision, cells, chests, openings, frontiers,
    parentOpeningId: page.parentOpeningId, completedExits, structure, unopened };
}
