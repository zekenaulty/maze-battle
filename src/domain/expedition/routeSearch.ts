import type { Direction } from '../types';
import { addressKey } from './address';
import { compass, copyAddress, type ObservedGraph } from './explorationGraph';
import type { RoutePlannerWork } from './routeKnowledge';
import type { CellAddress, ExpeditionCheckpoint, ExpeditionCommand } from './types';

export interface RouteSearchLimits {
  maxBatchSteps: number;
  maxCachedSearchCells: number;
  maxCachedSearches: number;
  maxPlanningVisits: number;
  maxPortStates: number;
}

export interface RouteStep {
  from: CellAddress;
  to?: CellAddress;
  command: ExpeditionCommand;
  lootIds?: string[];
  frontierOpeningId?: string;
}

export interface RouteBatch {
  target: CellAddress;
  reason: string;
  steps: RouteStep[];
}

interface LocalVisit { parent?: string; direction?: Direction; distance: number }
type LocalTree = Map<string, LocalVisit>;
interface Budget { visits: number; ports: number }

function spend(budget: Budget, limits: RouteSearchLimits) {
  if (++budget.visits > limits.maxPlanningVisits) throw new Error('Known-route planning visit budget exhausted.');
}

/** LRU by total retained tree cells as well as tree count; no host objects are retained. */
export class LocalRouteCache {
  private trees = new Map<string, LocalTree>();
  private cells = 0;
  get size() { return this.trees.size; }
  get cellCount() { return this.cells; }
  clear() { this.trees.clear(); this.cells = 0; }

  get(graph: ObservedGraph, start: string, limits: RouteSearchLimits, budget: Budget, work: RoutePlannerWork): LocalTree {
    const cached = this.trees.get(start);
    if (cached) {
      this.trees.delete(start);
      this.trees.set(start, cached);
      work.localCacheHits++;
      return cached;
    }
    work.localSearches++;
    const tree: LocalTree = new Map([[start, { distance: 0 }]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      spend(budget, limits);
      work.localCellVisits++;
      const key = queue[head];
      const node = graph.nodes.get(key)!;
      for (const direction of compass) {
        const edge = node.edges.get(direction);
        if (!edge || edge.openingId !== undefined || edge.destination === undefined || tree.has(edge.destination)) continue;
        tree.set(edge.destination, { parent: key, direction, distance: tree.get(key)!.distance + 1 });
        queue.push(edge.destination);
      }
    }
    if (tree.size <= limits.maxCachedSearchCells) {
      while (this.trees.size && (this.cells + tree.size > limits.maxCachedSearchCells || this.trees.size >= limits.maxCachedSearches)) {
        const oldest = this.trees.keys().next().value!;
        this.cells -= this.trees.get(oldest)!.size;
        this.trees.delete(oldest);
      }
      this.trees.set(start, tree);
      this.cells += tree.size;
    }
    return tree;
  }
}

interface PortState {
  entry: string;
  crossings: number;
  distance: number;
  order: number;
  via?: { previous: PortState; tree: LocalTree; exit: string; direction: Direction };
}

const compare = (a: PortState, b: PortState) => a.crossings - b.crossings || a.distance - b.distance || a.order - b.order;

/** A heap keeps discovered-port work bounded without sorting the whole queue per expansion. */
class PortQueue {
  private items: PortState[] = [];
  get length() { return this.items.length; }
  push(value: PortState) {
    let index = this.items.length;
    this.items.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (compare(this.items[parent], value) <= 0) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = value;
  }
  pop(): PortState {
    const first = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.items.length && compare(this.items[child + 1], this.items[child]) < 0) child++;
        if (compare(last, this.items[child]) <= 0) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

interface Objective {
  state: PortState;
  tree: LocalTree;
  key: string;
  distance: number;
  rank: number;
  target: CellAddress;
  final: RouteStep;
  reason: string;
}

function nearer(a: Objective, b?: Objective) {
  return !b || a.state.crossings < b.state.crossings
    || (a.state.crossings === b.state.crossings && (a.distance < b.distance || (a.distance === b.distance && a.rank < b.rank)));
}

function collectStep(graph: ObservedGraph, key: string): RouteStep {
  const node = graph.nodes.get(key)!;
  return { from: copyAddress(node.address), to: copyAddress(node.address), command: { type: 'collect' }, lootIds: [...node.lootIds] };
}

/**
 * Ports form the coarse graph; BFS inside each discovered local component supplies
 * exact paths and edge costs. Fewest door crossings wins before walking distance,
 * grouping nearby objectives in a space. Neither total tour nor global distance is optimal.
 */
export function planObservedRoute(graph: ObservedGraph, checkpoint: ExpeditionCheckpoint,
  limits: RouteSearchLimits, cache: LocalRouteCache, work: RoutePlannerWork): RouteBatch {
  work.plans++;
  const start = addressKey(checkpoint.position);
  const home = addressKey(checkpoint.home);
  if (!graph.nodes.has(start) || !graph.nodes.has(home)) throw new Error('Position or home is missing from observed cells.');
  if (graph.nodes.get(start)!.loot) return {
    target: copyAddress(checkpoint.position), reason: 'Collect discovered loot here.', steps: [collectStep(graph, start)],
  };
  const budget: Budget = { visits: 0, ports: 0 };
  const queue = new PortQueue();
  const root: PortState = { entry: start, crossings: 0, distance: 0, order: 0 };
  const bestEntries = new Map([[start, root]]);
  queue.push(root);
  let order = 1;
  let objective: Objective | undefined;
  let returnHome: Objective | undefined;
  while (queue.length) {
    const state = queue.pop();
    if (bestEntries.get(state.entry) !== state) continue;
    const limit = checkpoint.phase === 'returning' ? returnHome : objective;
    if (limit && state.crossings > limit.state.crossings) break;
    if (++budget.ports > limits.maxPortStates) throw new Error('Discovered-port planning budget exhausted.');
    work.portStates++;
    const tree = cache.get(graph, state.entry, limits, budget, work);
    for (const [key, visit] of tree) {
      spend(budget, limits);
      work.localNodesScanned++;
      const node = graph.nodes.get(key)!;
      const base = { state, tree, key, distance: state.distance + visit.distance, target: node.address };
      if (key === home) {
        const candidate: Objective = { ...base, rank: 2,
          final: { from: node.address, to: node.address, command: { type: 'finish' } },
          reason: 'Return home; finish requests host validation of finite-scope completion.' };
        if (nearer(candidate, returnHome)) returnHome = candidate;
      }
      if (checkpoint.phase === 'exploring' && node.loot) {
        const candidate: Objective = { ...base, rank: 0, final: collectStep(graph, key), reason: 'Approach nearby discovered loot within the observed space hierarchy.' };
        if (nearer(candidate, objective)) objective = candidate;
      }
      for (const direction of compass) {
        const edge = node.edges.get(direction);
        if (!edge) continue;
        if (edge.destination === undefined && checkpoint.phase === 'exploring') {
          const candidate: Objective = { ...base, distance: base.distance + 1, rank: 1, target: edge.target,
            final: { from: node.address, to: edge.openingId === undefined ? edge.target : undefined,
              frontierOpeningId: edge.openingId, command: { type: 'move', direction } },
            reason: 'Traverse an observed exploration frontier via a known waypoint route.' };
          if (nearer(candidate, objective)) objective = candidate;
        }
        if (edge.openingId === undefined || edge.destination === undefined) continue;
        const best = checkpoint.phase === 'returning' ? returnHome : objective;
        if (best && state.crossings >= best.state.crossings) continue;
        const next: PortState = { entry: edge.destination, crossings: state.crossings + 1, distance: base.distance + 1,
          order: order++, via: { previous: state, tree, exit: key, direction } };
        const previous = bestEntries.get(next.entry);
        if (!previous || compare(next, previous) < 0) {
          // Bound both the retained frontier and processed states, including stale heap entries.
          if (queue.length >= limits.maxPortStates || bestEntries.size >= limits.maxPortStates && !previous) {
            throw new Error('Discovered-port queue budget exhausted.');
          }
          bestEntries.set(next.entry, next);
          queue.push(next);
        }
      }
    }
  }
  if (checkpoint.phase === 'exploring' && !objective && graph.pending) throw new Error('Remaining discovered objectives have no known route.');
  const selected = checkpoint.phase === 'returning' ? returnHome : objective ?? returnHome;
  if (!selected) throw new Error('No known route home.');
  return buildBatch(graph, selected, limits.maxBatchSteps);
}

function buildBatch(graph: ObservedGraph, objective: Objective, maxSteps: number): RouteBatch {
  const segments: { tree: LocalTree; end: string; crossing?: RouteStep }[] = [];
  for (let state = objective.state; state.via; state = state.via.previous) {
    const via = state.via;
    segments.push({ tree: via.tree, end: via.exit, crossing: {
      from: graph.nodes.get(via.exit)!.address, to: graph.nodes.get(state.entry)!.address,
      command: { type: 'move', direction: via.direction },
    } });
  }
  segments.reverse();
  segments.push({ tree: objective.tree, end: objective.key });
  const batch: RouteBatch = { target: copyAddress(objective.target), reason: objective.reason, steps: [] };
  const append = (step: RouteStep) => {
    if (batch.steps.length >= maxSteps) return false;
    batch.steps.push({ ...step, from: copyAddress(step.from), to: step.to && copyAddress(step.to),
      command: { ...step.command }, lootIds: step.lootIds && [...step.lootIds] });
    return batch.steps.length < maxSteps;
  };
  for (const segment of segments) {
    const reverse: RouteStep[] = [];
    for (let key = segment.end, visit = segment.tree.get(key)!; visit.parent; visit = segment.tree.get(key)!) {
      reverse.push({ from: graph.nodes.get(visit.parent)!.address, to: graph.nodes.get(key)!.address,
        command: { type: 'move', direction: visit.direction! } });
      key = visit.parent;
    }
    for (let index = reverse.length - 1; index >= 0; index--) {
      const step = reverse[index];
      if (!append(step)) return batch;
      const key = addressKey(step.to!);
      if (graph.nodes.get(key)!.loot && !(key === objective.key && objective.final.command.type === 'collect')) {
        append(collectStep(graph, key));
        return batch;
      }
    }
    if (segment.crossing) {
      if (!append(segment.crossing)) return batch;
      const key = addressKey(segment.crossing.to!);
      if (graph.nodes.get(key)!.loot) {
        append(collectStep(graph, key));
        return batch;
      }
    }
  }
  append(objective.final);
  return batch;
}
