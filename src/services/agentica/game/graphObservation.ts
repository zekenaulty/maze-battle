import { KnownGraphUnavailableError, listKnownLinks, listKnownNodes, readKnownAnchor } from '../../../persistence/canonical/knowledge/graph';
import { observation, type PerceptionContext } from './context';
import { inspectionCursor } from './validation';
import type { InspectQuery } from './types';

/** Explicit room/connection operations; never hydrate world geometry or refresh sight. */
export async function graphObservation(c: PerceptionContext, query: InspectQuery, cursor?: string) {
  try {
    if (query.scope === 'map') {
      const page = await listKnownNodes(c.pages, c.checkpoint, { level: query.level, kind: 'room', limit: 2,
        ...(cursor ? { cursor } : {}) });
      return observation(c, { scope: 'map', level: query.level, rooms: page.items,
        ...(page.next ? { next: inspectionCursor(c.ref, query, page.next) } : {}) });
    }
    const scope = { level: query.level, spaceId: query.spaceId! };
    const anchor = await readKnownAnchor(c.pages, c.checkpoint, scope);
    if (!anchor) return observation(c, { scope: 'links', state: 'unknown' });
    const page = await listKnownLinks(c.pages, c.checkpoint, { ...scope, limit: 1, ...(cursor ? { cursor } : {}) });
    return observation(c, { scope: 'links', space: scope, links: page.items,
      ...(page.next ? { next: inspectionCursor(c.ref, query, page.next) } : {}) });
  } catch (error) {
    if (!(error instanceof KnownGraphUnavailableError)) throw error;
    return observation(c, { scope: query.scope, state: 'unavailable' });
  }
}
