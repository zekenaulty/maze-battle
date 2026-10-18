import { readFrontiers } from '../../../persistence/canonical/knowledge/frontiers';
import { check, jsonBytes } from '../../../persistence/canonical/validation';
import { observation, type PerceptionContext } from './context';
import { encodeFrontier } from './frontierSelection';
import { flatAddress, inspectionCursor } from './validation';
import { FRONTIER_PAGE_ITEMS, MAX_OBSERVATION_BYTES, MAX_PERCEPTION_READ_BYTES, type InspectQuery } from './types';

export async function frontierObservation(c: PerceptionContext, query: InspectQuery, start: number) {
  const candidates = await readFrontiers(c.pages, c.checkpoint);
  check(start === 0 || start < candidates.length, 'frontier cursor is outside current sight');
  const project = (selection: typeof candidates[number]) => ({ at: flatAddress(selection.at), direction: selection.direction,
    source: selection.source, frontier: encodeFrontier(c.ref, selection) });
  const frontiers: ReturnType<typeof project>[] = [];
  const data = (after: number, items: typeof frontiers) => ({ scope: 'frontiers', frontiers: items,
    ...(after < candidates.length ? { next: inspectionCursor(c.ref, query, after) } : {}) });
  for (let i = start; i < Math.min(candidates.length, start + FRONTIER_PAGE_ITEMS); i++) {
    const next = [...frontiers, project(candidates[i])];
    const bytes = jsonBytes(observation(c, data(i + 1, next), MAX_PERCEPTION_READ_BYTES), MAX_PERCEPTION_READ_BYTES);
    if (bytes > MAX_OBSERVATION_BYTES) { check(frontiers.length > 0, 'single frontier exceeds observation budget'); break; }
    frontiers.push(next.at(-1)!);
  }
  return observation(c, data(start + frontiers.length, frontiers));
}
