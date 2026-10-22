import { gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { fields, id, natural } from '../roster/codec';
import { check } from '../validation';
import { GraphCursorRefusal, graphCursor, graphScope, readGraphCursor } from './graph.cursor';
import { graphView } from './graph.read';
import { validateGraphLink } from './graph.roomConnections.link';
import type { KnowledgeRead } from './types';
import type { KnownAnchor, KnownLink, KnownLinksScope, KnownNode, KnownNodesScope, KnownPage, KnownSpaceScope } from './graph.types';
export { KnownGraphUnavailableError } from './graph.types';
export type { KnownAnchor, KnownLink, KnownLinksScope, KnownNode, KnownNodesScope, KnownPage, KnownSpaceScope } from './graph.types';

/** Discovery-ordered, point-read indexes. A missing member cannot silently shorten a page. */
export async function listKnownNodes(pages: KnowledgeRead, before: GameCheckpoint, input: KnownNodesScope): Promise<KnownPage<KnownNode>> {
  const checkpoint = gameCheckpoint(before), s = graphScope(input, true), scope = { scope: 'nodes' as const, level: s.level, kind: s.kind };
  const view = await graphView(pages, checkpoint, s.level), list = view.floor?.lists[s.kind];
  const after = readGraphCursor(s.cursor, view.anchor, scope) as { spaceId: string; ordinal: number } | null;
  const slot = s.kind === 'all' ? 'all' : 'kind';
  let next = list?.first ?? null, ordinal = 0;
  if (after) {
    const row = await view.node(after.spaceId);
    if (!row || s.kind !== 'all' && row.node.kind !== s.kind || row.ordinal[slot] !== after.ordinal)
      throw new GraphCursorRefusal('graph cursor member changed');
    next = row.next[slot]; ordinal = after.ordinal;
    if (!next) throw new GraphCursorRefusal('graph cursor has no continuation');
  }
  const items: KnownNode[] = [];
  while (next && items.length < s.limit) {
    const row = await view.node(next);
    check(row && (s.kind === 'all' || row.node.kind === s.kind) && row.ordinal[slot] === ordinal + 1, 'missing or reordered graph member');
    items.push(row.node); ordinal++; next = row.next[slot];
  }
  check(next !== null || ordinal === (list?.count ?? 0), 'incomplete graph index');
  return { anchor: view.anchor, items, ...(next ? { next: graphCursor(view.anchor, scope, { spaceId: items.at(-1)!.spaceId, ordinal }) } : {}) };
}

export async function readKnownAnchor(pages: KnowledgeRead, before: GameCheckpoint, input: KnownSpaceScope): Promise<KnownAnchor | null> {
  const checkpoint = gameCheckpoint(before), s = fields(input, 'level spaceId'); natural(s.level, 1); id(s.spaceId);
  const level = s.level, spaceId = s.spaceId, view = await graphView(pages, checkpoint, level);
  return (await view.node(spaceId))?.node.anchor ?? null;
}

export async function listKnownLinks(pages: KnowledgeRead, before: GameCheckpoint, input: KnownLinksScope): Promise<KnownPage<KnownLink>> {
  const checkpoint = gameCheckpoint(before), s = graphScope(input, false), scope = { scope: 'links' as const, level: s.level, spaceId: s.spaceId };
  const view = await graphView(pages, checkpoint, s.level), after = readGraphCursor(s.cursor, view.anchor, scope) as string | null;
  const node = await view.node(s.spaceId);
  check(node, 'unknown graph space');
  const links = (await view.links(s.spaceId)).links.sort((a, b) => a.id.localeCompare(b.id));
  const index = after ? links.findIndex(l => l.id === after) : -1;
  if (after && (index < 0 || index >= links.length - 1)) throw new GraphCursorRefusal('graph link cursor member changed');
  const items = links.slice(index + 1, index + 1 + s.limit);
  for (const link of items) await validateGraphLink(view, link);
  return { anchor: view.anchor, items, ...(index + 1 + items.length < links.length
    ? { next: graphCursor(view.anchor, scope, items.at(-1)!.id) } : {}) };
}
