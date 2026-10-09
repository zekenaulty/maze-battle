export interface RouteVisit<K, E> { key: K; distance: number; previous?: K; edge?: E }

/** Deterministic unit-cost search. The caller supplies the permitted graph, not a policy. */
export function shortestRoutes<K, E>(start: K, neighbours: (key: K) => Iterable<{ key: K; edge: E }>, maxVisits: number,
  onVisit?: () => void): Map<K, RouteVisit<K, E>> {
  const reached = new Map<K, RouteVisit<K, E>>([[start, { key: start, distance: 0 }]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    if (head >= maxVisits) throw new Error('Route visit budget exhausted.');
    onVisit?.();
    const current = reached.get(queue[head])!;
    for (const next of neighbours(current.key)) {
      if (reached.has(next.key)) continue;
      if (reached.size >= maxVisits) throw new Error('Route visit budget exhausted.');
      reached.set(next.key, { key: next.key, distance: current.distance + 1, previous: current.key, edge: next.edge });
      queue.push(next.key);
    }
  }
  return reached;
}
