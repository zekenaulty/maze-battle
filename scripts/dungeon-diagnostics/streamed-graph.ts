import type { CellAddress } from '../../src/domain/expedition/types';
import type { TopologyConnection, TopologySpace } from '../../src/domain/expedition/topology/types';

function distances(adjacency: Map<string, string[]>, root: string) {
  const result = new Map<string, number>();
  if (!adjacency.has(root)) return result;
  const queue = [root];
  result.set(root, 0);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const target of adjacency.get(id)!) {
      if (!result.has(target)) {
        result.set(target, result.get(id)! + 1);
        queue.push(target);
      }
    }
  }
  return result;
}

export function roomGraph(spaces: TopologySpace[], links: TopologyConnection[], start: CellAddress) {
  const byId = new Map(spaces.map(value => [value.spec.id, value.spec]));
  const incident = new Map(spaces.map(value => [value.spec.id, [] as TopologyConnection[]]));
  const edges: [string, string][] = [];
  for (const link of links) {
    const from = byId.get(link.from.spaceId);
    const to = byId.get(link.to.spaceId);
    if (!from || !to) return null;
    incident.get(from.id)!.push(link);
    incident.get(to.id)!.push(link);
    if (from.kind === 'room' && to.kind === 'room') edges.push([from.id, to.id]);
  }
  const seenPassages = new Set<string>();
  for (const { spec } of spaces) {
    if (spec.kind !== 'passage' || seenPassages.has(spec.id)) continue;
    const queue = [spec.id];
    const endpoints: string[] = [];
    seenPassages.add(spec.id);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      // A branching, dangling or closed passage component has no unambiguous room edge.
      if (incident.get(id)!.length !== 2) return null;
      for (const link of incident.get(id)!) {
        const target = link.from.spaceId === id ? link.to.spaceId : link.from.spaceId;
        if (byId.get(target)!.kind === 'room') endpoints.push(target);
        else if (!seenPassages.has(target)) { seenPassages.add(target); queue.push(target); }
      }
    }
    if (endpoints.length !== 2) return null;
    edges.push([endpoints[0], endpoints[1]]);
  }
  const rooms = spaces.filter(value => value.spec.kind === 'room').map(value => value.spec.id);
  if (!rooms.length) return null;
  const adjacency = new Map(rooms.map(id => [id, [] as string[]]));
  for (const [from, to] of edges) {
    adjacency.get(from)!.push(to);
    adjacency.get(to)!.push(from);
  }
  const degrees = Object.fromEntries(rooms.map(id => [id, adjacency.get(id)!.length]));
  const degreeHistogram: Record<string, number> = {};
  for (const degree of Object.values(degrees)) degreeHistogram[degree] = (degreeHistogram[degree] ?? 0) + 1;
  const visited = new Set<string>();
  const componentDiameters: number[] = [];
  for (const id of rooms) {
    if (visited.has(id)) continue;
    const component = [...distances(adjacency, id).keys()];
    let diameter = 0;
    for (const root of component) {
      visited.add(root);
      diameter = Math.max(diameter, ...distances(adjacency, root).values());
    }
    componentDiameters.push(diameter);
  }
  const depths = distances(adjacency, start.spaceId);
  const branchDepths = Object.fromEntries(rooms.filter(id => id !== start.spaceId && degrees[id] === 1)
    .map(id => [id, depths.get(id) ?? null]));
  const reachableBranches = Object.values(branchDepths).filter((value): value is number => value !== null);
  return {
    nodes: rooms.length, edges: edges.length, degrees, degreeHistogram,
    forks: Object.values(degrees).filter(degree => degree >= 3).length,
    endpoints: Object.values(degrees).filter(degree => degree === 1).length,
    isolated: Object.values(degrees).filter(degree => degree === 0).length,
    loops: edges.length - rooms.length + componentDiameters.length,
    components: componentDiameters.length, componentDiameters,
    diameter: componentDiameters.length === 1 ? componentDiameters[0] : null,
    depthsFromEntry: Object.fromEntries(rooms.map(id => [id, depths.get(id) ?? null])),
    branchDepths, maxBranchDepth: reachableBranches.length ? Math.max(...reachableBranches) : null,
  };
}
