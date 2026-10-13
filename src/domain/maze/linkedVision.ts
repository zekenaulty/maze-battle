// A radius-16 neighborhood in a four-way grid has at most 1 + 2 * 16 * 17 cells.
const DEFAULT_MAX_CELLS = 545;

/**
 * Linked-path visibility in stable BFS order; radius is an integer from 0 to 16.
 * maxCells defaults to 545, includes the origin, and throws on overflow.
 */
export function linkedVision<T>(
  origin: T,
  radius: number,
  key: (cell: T) => string,
  neighbors: (cell: T) => readonly T[],
  maxCells = DEFAULT_MAX_CELLS,
): T[] {
  const frontier = linkedFrontier(origin, radius, key, maxCells);
  let step = frontier.next();
  while (true) {
    if (step.done === true) return step.value;
    step = frontier.next(neighbors(step.value));
  }
}

/** Async variant with the same bounds; never expands cells at the radius boundary. */
export async function asyncLinkedVision<T>(
  origin: T,
  radius: number,
  key: (cell: T) => string,
  neighbors: (cell: T) => Promise<readonly T[]>,
  maxCells = DEFAULT_MAX_CELLS,
): Promise<T[]> {
  const frontier = linkedFrontier(origin, radius, key, maxCells);
  let step = frontier.next();
  while (true) {
    if (step.done === true) return step.value;
    step = frontier.next(await neighbors(step.value));
  }
}

// The drivers supply links; this shared frontier owns traversal, identity and bounds.
function* linkedFrontier<T>(
  origin: T,
  radius: number,
  key: (cell: T) => string,
  maxCells: number,
): Generator<T, T[], readonly T[]> {
  if (!Number.isInteger(radius) || radius < 0 || radius > 16) {
    throw new RangeError('radius must be an integer from 0 to 16');
  }
  if (!Number.isSafeInteger(maxCells) || maxCells < 1) {
    throw new RangeError('maxCells must be a positive safe integer');
  }

  const queue = [{ cell: origin, distance: 0 }];
  const visited = new Set([key(origin)]);
  for (let index = 0; index < queue.length; index++) {
    const { cell, distance } = queue[index];
    if (distance >= radius) continue;

    const neighbors = yield cell;
    for (const next of neighbors) {
      const nextKey = key(next);
      if (visited.has(nextKey)) continue;
      if (queue.length >= maxCells) {
        throw new RangeError(`linked vision exceeds maxCells (${maxCells})`);
      }
      visited.add(nextKey);
      queue.push({ cell: next, distance: distance + 1 });
    }
  }
  return queue.map(({ cell }) => cell);
}
