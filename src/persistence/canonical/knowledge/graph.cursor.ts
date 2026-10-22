import { fields, id, natural } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import { same } from '../world/records';
import { knowledgeAnchor } from './validation';
import type { KnowledgeAnchor } from './types';
import type { KnownLinksScope, KnownNodesScope } from './graph.types';

type CursorScope = { scope: 'nodes'; level: number; kind: KnownNodesScope['kind'] }
  | { scope: 'links'; level: number; spaceId: string };
export function graphScope<T extends KnownNodesScope | KnownLinksScope>(value: T, nodes: boolean): T & { limit: number } {
  const s = fields(value, nodes ? 'level kind' : 'level spaceId', 'cursor limit'); natural(s.level, 1);
  if (nodes) check(s.kind === 'all' || s.kind === 'room' || s.kind === 'passage', 'invalid graph kind'); else id(s.spaceId);
  const limit = s.limit ?? 4; natural(limit, 1); check(limit <= 4, 'invalid graph page size');
  check(s.cursor === undefined || typeof s.cursor === 'string' && s.cursor.length <= 2048, 'invalid graph cursor');
  return structuredClone({ ...value, limit });
}
/** Internal, not an authority token: the public adapter must retain original query evidence. */
export function readGraphCursor(cursor: string | undefined, anchor: KnowledgeAnchor, scope: CursorScope) {
  if (cursor === undefined) return null;
  jsonBytes(cursor, 4096);
  let parsed: unknown; try { parsed = JSON.parse(cursor); } catch { throw Error('Canonical storage: malformed graph cursor'); }
  check(JSON.stringify(parsed) === cursor, 'noncanonical graph cursor');
  const c = fields(parsed, scope.scope === 'nodes' ? 'schema scope anchor level kind after' : 'schema scope anchor level spaceId after');
  knowledgeAnchor(c.anchor);
  check(c.schema === 1 && same(c.anchor, anchor) && Object.entries(scope).every(([k, v]) => c[k] === v), 'stale or foreign graph cursor');
  if (scope.scope === 'nodes') { const a = fields(c.after, 'spaceId ordinal'); id(a.spaceId); natural(a.ordinal, 1); }
  else check(typeof c.after === 'string' && /^[a-f0-9]{64}$/.test(c.after), 'invalid graph link cursor');
  return c.after as { spaceId: string; ordinal: number } | string;
}
export const graphCursor = (anchor: KnowledgeAnchor, scope: CursorScope, after: unknown) => JSON.stringify({ schema: 1, ...scope, anchor, after });
