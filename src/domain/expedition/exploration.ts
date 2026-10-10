import type { Direction } from '../types';
import { addressKey } from './address';
import { compass as directions, copyAddress as address, isAddress, isRecord, observedGraph } from './explorationGraph';
import type { CellAddress, ExpeditionCheckpoint, ExplorationDecision } from './types';

interface Visit {
  key: string;
  distance: number;
  first?: Direction;
}

interface Objective {
  distance: number;
  decision: ExplorationDecision;
}

function blocked(reason: string): ExplorationDecision {
  return { reason: `Blocked: ${reason}` };
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
