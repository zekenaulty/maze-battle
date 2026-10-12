export interface RouteVisit<K, E> { key: K; distance: number; previous?: K; edge?: E }
type Neighbours<K, E> = Iterable<{ key: K; edge: E }>;

function* traversal<K, E>(start: K, maxVisits: number,
  onVisit?: () => void): Generator<K, Map<K, RouteVisit<K, E>>, Neighbours<K, E>> {
  const reached = new Map<K, RouteVisit<K, E>>([[start, { key: start, distance: 0 }]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    if (head >= maxVisits) throw new Error('Route visit budget exhausted.');
    onVisit?.();
    const current = reached.get(queue[head])!;
    for (const next of yield current.key) {
      if (reached.has(next.key)) continue;
      if (reached.size >= maxVisits) throw new Error('Route visit budget exhausted.');
      reached.set(next.key, { key: next.key, distance: current.distance + 1, previous: current.key, edge: next.edge });
      queue.push(next.key);
    }
  }
  return reached;
}

/** Deterministic unit-cost search. The caller supplies the permitted graph, not a policy. */
export function shortestRoutes<K, E>(start: K, neighbours: (key: K) => Neighbours<K, E>, maxVisits: number,
  onVisit?: () => void): Map<K, RouteVisit<K, E>> {
  const search = traversal<K, E>(start, maxVisits, onVisit);
  let step = search.next();
  for (;;) {
    if (step.done === true) return step.value;
    step = search.next(neighbours(step.value));
  }
}

/** The same traversal with sequential, transaction-local asynchronous point reads. */
export async function shortestRoutesAsync<K, E>(start: K, neighbours: (key: K) => Promise<Neighbours<K, E>> | Neighbours<K, E>,
  maxVisits: number, onVisit?: () => void): Promise<Map<K, RouteVisit<K, E>>> {
  const search = traversal<K, E>(start, maxVisits, onVisit);
  let step = search.next();
  for (;;) {
    if (step.done === true) return step.value;
    step = search.next(await neighbours(step.value));
  }
}
