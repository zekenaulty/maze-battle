import type { Direction } from '../types';
import { addressKey, sameAddress } from './address';
import type { CellAddress, ExpeditionCheckpoint, ExplorationDecision } from './types';

const directions: Direction[] = ['north', 'east', 'south', 'west'];
const offsets: Record<Direction, readonly [number, number]> = {
  north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1],
};

interface Edge {
  destination?: string;
  target: CellAddress;
}

interface Node {
  address: CellAddress;
  edges: Map<Direction, Edge>;
  loot: boolean;
}

interface Graph {
  nodes: Map<string, Node>;
  pending: boolean;
}

interface Visit {
  key: string;
  distance: number;
  first?: Direction;
}

interface Objective {
  distance: number;
  decision: ExplorationDecision;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAddress(value: unknown): value is CellAddress {
  return isRecord(value) && typeof value.spaceId === 'string' && value.spaceId.length > 0
    && Number.isSafeInteger(value.row) && Number(value.row) >= 0
    && Number.isSafeInteger(value.column) && Number(value.column) >= 0;
}

function isDirection(value: unknown): value is Direction {
  return directions.some((direction) => direction === value);
}

function isObserved(value: Record<string, unknown>) {
  return typeof value.observedAt === 'number' && Number.isFinite(value.observedAt) && value.observedAt >= 0;
}

function address(value: CellAddress): CellAddress {
  return { spaceId: value.spaceId, row: value.row, column: value.column };
}

function blocked(reason: string): ExplorationDecision {
  return { reason: `Blocked: ${reason}` };
}

/** Validate persisted JSON before using it; invalid records must not disappear into "no work". */
function observedGraph(knowledge: unknown, opened: Set<string>): Graph | undefined {
  if (!isRecord(knowledge) || !isRecord(knowledge.cells)
    || !isRecord(knowledge.openings) || !isRecord(knowledge.chests)) return undefined;

  const nodes = new Map<string, Node>();
  for (const [key, cell] of Object.entries(knowledge.cells)) {
    if (!isRecord(cell) || !isAddress(cell) || addressKey(cell) !== key || !isObserved(cell)
      || !Array.isArray(cell.links) || cell.links.length > directions.length
      || new Set(cell.links).size !== cell.links.length) return undefined;
    const node: Node = { address: address(cell), edges: new Map(), loot: false };
    for (const direction of cell.links) {
      if (!isDirection(direction)) return undefined;
      const [row, column] = offsets[direction];
      const target = { spaceId: cell.spaceId, row: cell.row + row, column: cell.column + column };
      if (!isAddress(target)) return undefined;
      node.edges.set(direction, { target });
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

  for (const [id, opening] of Object.entries(knowledge.openings)) {
    if (!isRecord(opening) || !isAddress(opening) || !isObserved(opening)
      || id.length === 0 || opening.id !== id || !isDirection(opening.direction)) return undefined;
    const node = nodes.get(addressKey(opening));
    // A move direction cannot simultaneously mean a local link and an opening (or two openings).
    if (!node || node.edges.has(opening.direction)) return undefined;
    const edge: Edge = { target: address(opening) };
    if (opening.destination !== undefined) {
      if (!isAddress(opening.destination) || sameAddress(opening, opening.destination)) return undefined;
      const key = addressKey(opening.destination);
      if (!nodes.has(key)) return undefined;
      edge.destination = key;
    } else {
      pending = true;
    }
    node.edges.set(opening.direction, edge);
  }

  for (const [id, chest] of Object.entries(knowledge.chests)) {
    if (!isRecord(chest) || !isAddress(chest) || !isObserved(chest)
      || id.length === 0 || chest.id !== id || typeof chest.opened !== 'boolean') return undefined;
    const node = nodes.get(addressKey(chest));
    if (!node) return undefined;
    if (!chest.opened && !opened.has(id)) {
      node.loot = true;
      pending = true;
    }
  }
  return { nodes, pending };
}

function move(direction: Direction, target: CellAddress, reason: string): ExplorationDecision {
  return { command: { type: 'move', direction }, target: address(target), reason };
}

/**
 * Pure, observation-only nearest-objective policy for the finite fixture.
 * Linear work in known records and opened IDs per call; no per-target searches,
 * recursion, world access, or hidden route cache. The contract emits one command and a
 * waypoint, not a persisted command batch. This is not hierarchical or globally optimal.
 */
export function chooseExplorationDecision(checkpoint: ExpeditionCheckpoint): ExplorationDecision {
  if (!isRecord(checkpoint)) return blocked('invalid checkpoint.');
  if (checkpoint.phase === 'complete') return { reason: 'Expedition already complete.' };
  if (checkpoint.version !== 1 || (checkpoint.phase !== 'exploring' && checkpoint.phase !== 'returning')
    || !isAddress(checkpoint.position) || !isAddress(checkpoint.home)
    || !Array.isArray(checkpoint.openedChestIds)) {
    return blocked('invalid checkpoint.');
  }
  const opened = new Set<string>();
  for (const id of checkpoint.openedChestIds) {
    if (typeof id !== 'string' || id.length === 0) return blocked('invalid opened chest IDs.');
    opened.add(id);
  }
  const graph = observedGraph(checkpoint.knowledge, opened);
  if (!graph) return blocked('empty or corrupt observed knowledge.');
  const start = addressKey(checkpoint.position);
  const home = addressKey(checkpoint.home);
  if (!graph.nodes.has(start) || !graph.nodes.has(home)) {
    return blocked('position or home is missing from observed cells.');
  }
  if (graph.nodes.get(start)!.loot) {
    return { command: { type: 'collect' }, target: address(checkpoint.position), reason: 'Collect discovered loot here.' };
  }

  const queue: Visit[] = [{ key: start, distance: 0 }];
  const seen = new Set([start]);
  let homeVisit: Visit | undefined;
  let loot: Objective | undefined;
  let frontier: Objective | undefined;
  for (let head = 0; head < queue.length; head++) {
    const visit = queue[head];
    const node = graph.nodes.get(visit.key)!;
    if (visit.key === home) homeVisit = visit;
    if (checkpoint.phase === 'exploring' && node.loot && !loot) {
      loot = {
        distance: visit.distance,
        decision: move(visit.first!, node.address, 'Approach nearby discovered loot.'),
      };
    }
    // Fixed compass order makes equal-cost choices independent of record insertion order.
    for (const direction of directions) {
      const edge = node.edges.get(direction);
      if (!edge) continue;
      const first = visit.first ?? direction;
      if (edge.destination === undefined) {
        if (checkpoint.phase === 'exploring' && !frontier) {
          frontier = {
            distance: visit.distance + 1,
            decision: move(first, edge.target, visit.distance === 0
              ? 'Traverse an observed exploration frontier.' : 'Approach an observed exploration frontier.'),
          };
        }
      } else if (!seen.has(edge.destination)) {
        seen.add(edge.destination);
        queue.push({ key: edge.destination, distance: visit.distance + 1, first });
      }
    }
  }

  if (checkpoint.phase === 'exploring') {
    // Count the outward frontier move: loot wins equally near ties, including loot en route.
    if (loot && (!frontier || loot.distance <= frontier.distance)) return loot.decision;
    if (frontier) return frontier.decision;
    if (graph.pending) return blocked('remaining discovered loot or frontiers have no known route.');
  }
  if (!homeVisit) return blocked('no known route home.');
  if (homeVisit.first) return move(homeVisit.first, checkpoint.home, 'Return home along observed paths.');
  return {
    command: { type: 'finish' }, target: address(checkpoint.home),
    reason: 'Request host validation of finite-scope completion at home.',
  };
}
