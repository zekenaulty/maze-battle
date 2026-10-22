import { readRoomConnectionsCursor } from '../../../persistence/canonical/knowledge/graph.roomConnections.cursor';
import type { KnowledgeAnchor } from '../../../persistence/canonical/knowledge/types';
import { check } from '../../../persistence/canonical/validation';
import type { InspectQuery } from './types';

/** The outer inspection cursor separately binds publication and the resolved public query. */
export function connectionsAfter(value: unknown, anchor: KnowledgeAnchor | null | undefined, query: InspectQuery) {
  check(typeof value === 'string' && value.length > 0 && value.length <= 768 && anchor, 'invalid connections cursor');
  readRoomConnectionsCursor(value, anchor, { level: query.level, spaceId: query.spaceId! });
}
