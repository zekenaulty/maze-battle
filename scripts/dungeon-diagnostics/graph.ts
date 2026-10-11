export interface Edge { from: string; to: string }

/** Audit-only graph statistics. No result is passed to actor navigation. */
export function graphMetrics(ids: string[], edges: Edge[], root = ids[0]) {
  const duplicateNodes = ids.length - new Set(ids).size;
  ids = [...new Set(ids)];
  const adjacency = new Map(ids.map(id => [id, new Set<string>()]));
  let invalidEdges = 0;
  const unique = new Set<string>();
  for (const { from, to } of edges) {
    const key = JSON.stringify([from, to].sort());
    if (from === to || !adjacency.has(from) || !adjacency.has(to) || unique.has(key)) {
      invalidEdges++;
      continue;
    }
    unique.add(key);
    adjacency.get(from)!.add(to);
    adjacency.get(to)!.add(from);
  }
  const distances = (start: string) => {
    if (!adjacency.has(start)) return new Map<string, number>();
    const result = new Map([[start, 0]]);
    const queue = [start];
    for (const id of queue) for (const next of adjacency.get(id) ?? []) {
      if (result.has(next)) continue;
      result.set(next, result.get(id)! + 1);
      queue.push(next);
    }
    return result;
  };
  let components = 0;
  const seen = new Set<string>();
  let diameter = 0;
  let pairHops = 0;
  let reachablePairs = 0;
  for (const id of ids) {
    const hops = distances(id);
    if (!seen.has(id)) { components++; for (const next of hops.keys()) seen.add(next); }
    for (const [to, value] of hops) if (to !== id) {
      diameter = Math.max(diameter, value);
      pairHops += value;
      reachablePairs++;
    }
  }
  const histogram: Record<string, number> = {};
  for (const neighbors of adjacency.values()) histogram[neighbors.size] = (histogram[neighbors.size] ?? 0) + 1;
  const endpoints = ids.filter(id => adjacency.get(id)!.size === 1);
  const branches = endpoints.filter(id => id !== root).map(id => {
    let current = id;
    let previous = '';
    let length = 0;
    while (current !== root) {
      const next = [...adjacency.get(current)!].find(value => value !== previous);
      if (!next) break;
      previous = current;
      current = next;
      length++;
      if (adjacency.get(current)!.size !== 2) break;
    }
    return length;
  });
  return { nodes: ids.length, duplicateNodes, edges: unique.size, invalidEdges, components,
    degrees: histogram, forks: ids.filter(id => adjacency.get(id)!.size >= 3).length,
    endpoints: endpoints.length, loops: unique.size - ids.length + components,
    diameterHops: diameter, meanPairHops: reachablePairs ? pairHops / reachablePairs : 0,
    rootMaxHops: Math.max(0, ...distances(root).values()),
    terminalBranchMaxHops: Math.max(0, ...branches),
    terminalBranchMeanHops: branches.length ? branches.reduce((a, b) => a + b, 0) / branches.length : 0 };
}
