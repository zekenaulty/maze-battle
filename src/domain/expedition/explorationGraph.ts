import type { Direction } from '../types';
import { addressKey, sameAddress } from './address';
import type { CellAddress, KnownCell, KnownChest, KnownOpening } from './types';

export const compass: readonly Direction[] = ['north', 'east', 'south', 'west'];
const offsets: Record<Direction, readonly [number, number]> = {
  north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1],
};

export interface ObservedEdge {
  destination?: string;
  openingId?: string;
  target: CellAddress;
}

export interface ObservedNode {
  address: CellAddress;
  edges: Map<Direction, ObservedEdge>;
  loot: boolean;
  lootIds: string[];
}

export interface ObservedGraph {
  nodes: Map<string, ObservedNode>;
  pending: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isAddress(value: unknown): value is CellAddress {
  return isRecord(value) && typeof value.spaceId === 'string' && value.spaceId.length > 0
    && Number.isSafeInteger(value.row) && Number(value.row) >= 0
    && Number.isSafeInteger(value.column) && Number(value.column) >= 0;
}

export function copyAddress(value: CellAddress): CellAddress {
  return { spaceId: value.spaceId, row: value.row, column: value.column };
}

export type KnowledgeKind = 'cells' | 'openings' | 'chests';

/** Timestamps are not route changes. Values, keys, and ambiguous directions still require validation. */
export function knowledgeSignature(kind: KnowledgeKind, key: string, value: unknown): string | undefined {
  if (!isRecord(value) || !isAddress(value) || typeof value.observedAt !== 'number'
    || !Number.isFinite(value.observedAt) || value.observedAt < 0) return undefined;
  const position = addressKey(value);
  if (kind === 'cells') {
    if (key !== position || !Array.isArray(value.links) || value.links.length > 4
      || new Set(value.links).size !== value.links.length) return undefined;
    for (const direction of value.links) {
      if (!compass.includes(direction)) return undefined;
      const [row, column] = offsets[direction as Direction];
      if (!isAddress({ ...copyAddress(value), row: value.row + row, column: value.column + column })) return undefined;
    }
    const links = value.links;
    return JSON.stringify([position, compass.filter(direction => links.includes(direction))]);
  }
  if (!key || value.id !== key) return undefined;
  if (kind === 'chests') {
    return typeof value.opened === 'boolean' ? JSON.stringify([position, value.opened]) : undefined;
  }
  if (!compass.includes(value.direction as Direction)) return undefined;
  if (value.destination !== undefined && (!isAddress(value.destination) || sameAddress(value, value.destination))) return undefined;
  return JSON.stringify([position, value.direction, value.destination === undefined ? null : addressKey(value.destination as CellAddress)]);
}

/** Validate persisted JSON before using it; invalid records must not disappear into "no work". */
export function observedGraph(knowledge: unknown, opened: Set<string>): ObservedGraph | undefined {
  if (!isRecord(knowledge) || !isRecord(knowledge.cells)
    || !isRecord(knowledge.openings) || !isRecord(knowledge.chests)) return undefined;
  const nodes = new Map<string, ObservedNode>();
  for (const [key, value] of Object.entries(knowledge.cells)) {
    if (knowledgeSignature('cells', key, value) === undefined) return undefined;
    const cell = value as KnownCell;
    const node: ObservedNode = { address: copyAddress(cell), edges: new Map(), loot: false, lootIds: [] };
    for (const direction of cell.links) {
      const [row, column] = offsets[direction];
      node.edges.set(direction, { target: { spaceId: cell.spaceId, row: cell.row + row, column: cell.column + column } });
    }
    nodes.set(key, node);
  }
  if (nodes.size === 0) return undefined;
  let pending = false;
  for (const node of nodes.values()) {
    for (const edge of node.edges.values()) {
      const key = addressKey(edge.target);
      if (nodes.has(key)) edge.destination = key;
      else pending = true;
    }
  }
  for (const [id, value] of Object.entries(knowledge.openings)) {
    if (knowledgeSignature('openings', id, value) === undefined) return undefined;
    const opening = value as KnownOpening;
    const node = nodes.get(addressKey(opening));
    if (!node || node.edges.has(opening.direction)) return undefined;
    const edge: ObservedEdge = { openingId: id, target: copyAddress(opening) };
    if (opening.destination !== undefined) {
      const key = addressKey(opening.destination);
      if (!nodes.has(key)) return undefined;
      edge.destination = key;
    } else pending = true;
    node.edges.set(opening.direction, edge);
  }
  for (const [id, value] of Object.entries(knowledge.chests)) {
    if (knowledgeSignature('chests', id, value) === undefined) return undefined;
    const chest = value as KnownChest;
    const node = nodes.get(addressKey(chest));
    if (!node) return undefined;
    if (!chest.opened && !opened.has(id)) {
      node.loot = true;
      node.lootIds.push(id);
      pending = true;
    }
  }
  return { nodes, pending };
}
