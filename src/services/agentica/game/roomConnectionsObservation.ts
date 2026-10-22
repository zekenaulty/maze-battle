import { listRoomConnections } from '../../../persistence/canonical/knowledge/graph.roomConnections';
import { graphView } from '../../../persistence/canonical/knowledge/graph.read';
import { observation, type PerceptionContext } from './context';
import { connectionsAfter } from './roomConnectionsValidation';
import { inspectionCursor } from './validation';
import type { InspectQuery } from './types';

/** Collapse only earned passages. Path commitments are evidence, never movement authority. */
export async function roomConnectionsObservation(c: PerceptionContext, query: InspectQuery, cursor?: string) {
  const scope = { level: query.level, spaceId: query.spaceId! };
  const view = await graphView(c.pages, c.checkpoint, scope.level), selected = await view.node(scope.spaceId);
  if (selected?.node.kind !== 'room') return observation(c, { scope: 'connections', state: 'refused', reason: 'not-known-room' });
  const page = await listRoomConnections(c.pages, c.checkpoint, { ...scope, limit: 1, ...(cursor ? { cursor } : {}) });
  if (page.next) connectionsAfter(page.next, page.anchor, query);
  return observation(c, { scope: 'connections', room: page.from, coverage: 'indexed-exits',
    state: page.state, ...(page.reason ? { reason: page.reason } : {}), connections: page.items,
    ...(page.next ? { next: inspectionCursor(c.ref, query, page.next) } : {}) });
}
