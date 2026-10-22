import { opposite } from '../../../domain/maze/movement';
import type { CanonicalPages } from '../pages';
import { check } from '../validation';
import { same } from '../world/records';
import { cellKey, roomKey } from './keys';
import { fields } from '../roster/codec';
import { cellSource } from './validation';
import { DIRECTIONS, MAX_VISIBLE_CELLS, type ObservationRef, type ObservedCell, type ObservedSpace } from './types';
import { floorKey, GRAPH_KEY, graphFloor, graphLinks, graphMember, graphNode, linkId, linksKey, nodeKey } from './graph.records';
import { graphRecord, storeGraph } from './graph.storage';
import { graphSources } from './graph.evidence';
import type { GraphFloor, GraphLinks, GraphNode, KnownAnchor, KnownLink } from './graph.types';

/** Only the current bounded observation is indexed. No old observations are discovered or backfilled. */
export async function indexObservationGraph(pages: CanonicalPages, cells: ObservedCell[], spaces: ObservedSpace[], ref: ObservationRef) {
  check(cells.length > 0 && cells.length <= MAX_VISIBLE_CELLS && spaces.length <= 16, 'unbounded graph update');
  cells = structuredClone(cells); spaces = structuredClone(spaces); ref = { sequence: ref.sequence, id: ref.id };
  const level = cells[0].at.level, fk = floorKey(level), existingFloor = await graphRecord(pages, fk);
  const floor: GraphFloor = existingFloor ? graphFloor(existingFloor.value) : { schema: 1, level,
    lists: { all: { first: null, last: null, count: 0 }, room: { first: null, last: null, count: 0 }, passage: { first: null, last: null, count: 0 } } };
  check(floor.level === level, 'foreign graph floor');
  if (ref.sequence === 1) {
    check(!await graphRecord(pages, GRAPH_KEY), 'graph origin already exists');
    await storeGraph(pages, GRAPH_KEY, { schema: 1, policy: 'earned-spaces-v1', origin: ref });
  }
  const nodes = new Map<string, GraphNode>(), adjacency = new Map<string, GraphLinks>();
  const changedNodes = new Set<string>(), changedLinks = new Set<string>(), evidence = graphSources(pages, ref.sequence);
  const loadNode = async (spaceId: string) => {
    let n = nodes.get(spaceId);
    if (!n) {
      const row = await graphRecord(pages, nodeKey(level, spaceId));
      if (!row) return null;
      n = graphNode(row.value); check(n.node.level === level && n.node.spaceId === spaceId, 'foreign graph node');
      graphMember(n, floor);
      await evidence.node(n.node); nodes.set(spaceId, n);
    }
    return n;
  };
  const loadLinks = async (spaceId: string) => {
    let a = adjacency.get(spaceId);
    if (!a) {
      const row = await graphRecord(pages, linksKey(level, spaceId)); check(row, 'missing graph adjacency');
      a = graphLinks(row.value); check(a.level === level && a.spaceId === spaceId, 'foreign graph adjacency');
      adjacency.set(spaceId, a);
    }
    return a;
  };
  for (const space of spaces) {
    const seen = cells[space.index]; check(seen?.at.level === level && seen.at.cell.spaceId === space.spaceId, 'unobserved graph classification');
    const prior = await loadNode(space.spaceId);
    if (prior) { check(prior.node.kind === space.kind, 'earned space classification changed'); await loadLinks(space.spaceId); continue; }
    const known = await pages.get('knowledge', roomKey(level, space.spaceId)); check(known, 'graph update requires earned room memory');
    const membership = fields(known.value, 'schema level spaceId source'); cellSource(membership.source);
    check(membership.schema === 1 && membership.level === level && membership.spaceId === space.spaceId
      && membership.source.sequence === ref.sequence && membership.source.id === ref.id, 'missing graph node cannot be backfilled');
    check(!await graphRecord(pages, linksKey(level, space.spaceId)), 'orphan graph adjacency');
    const anchor: KnownAnchor = { at: seen.at, world: seen.world, source: { ...ref, index: space.index } };
    const node: GraphNode = { schema: 1, node: { level, spaceId: space.spaceId, kind: space.kind, anchor },
      ordinal: { all: floor.lists.all.count + 1, kind: floor.lists[space.kind].count + 1 }, next: { all: null, kind: null } };
    for (const kind of ['all', space.kind] as const) {
      const list = floor.lists[kind], slot = kind === 'all' ? 'all' : 'kind';
      if (list.last) {
        const tail = await loadNode(list.last);
        check(tail && tail.next[slot] === null && tail.ordinal[slot] === list.count, 'broken graph index tail');
        tail.next[slot] = space.spaceId; changedNodes.add(list.last);
      } else list.first = space.spaceId;
      list.last = space.spaceId; list.count++;
    }
    nodes.set(space.spaceId, node); changedNodes.add(space.spaceId);
    adjacency.set(space.spaceId, { schema: 1, level, spaceId: space.spaceId, links: [] }); changedLinks.add(space.spaceId);
  }
  const byCell = new Map(cells.map((c, index) => [cellKey(c.at), { c, index }]));
  for (const space of spaces) {
    const links = await loadLinks(space.spaceId);
    for (const old of [...links.links]) {
      const seen = byCell.get(cellKey(old.from.at))?.c;
      if (!seen || !Object.hasOwn(seen.edges, old.direction) || same(seen.edges[old.direction], old.to.at)) continue;
      const other = await loadLinks(old.to.at.cell.spaceId), reverse = other.links.find(l => l.id === old.id);
      check(reverse && same(reverse.from, old.to) && same(reverse.to, old.from) && reverse.direction === opposite(old.direction), 'missing reciprocal graph link');
      links.links = links.links.filter(l => l.id !== old.id); other.links = other.links.filter(l => l.id !== old.id);
      changedLinks.add(space.spaceId); changedLinks.add(other.spaceId);
    }
  }
  for (const [index, seen] of cells.entries()) for (const direction of DIRECTIONS) {
    const to = seen.edges[direction]; if (!to || to.cell.spaceId === seen.at.cell.spaceId) continue;
    const target = byCell.get(cellKey(to));
    check(target && same(target.c.edges[opposite(direction)], seen.at), 'graph edge is not jointly observed');
    const from: KnownAnchor = { at: seen.at, world: seen.world, source: { ...ref, index } };
    const endpoint: KnownAnchor = { at: to, world: target.c.world, source: { ...ref, index: target.index } };
    const link: KnownLink = { id: linkId(from, endpoint), from, to: endpoint, direction }, links = await loadLinks(seen.at.cell.spaceId);
    const prior = links.links.find(l => l.id === link.id);
    if (prior) { check(prior.direction === direction && same(prior.from.at, from.at) && same(prior.to.at, to), 'conflicting graph connection'); continue; }
    check(links.links.length < 4, 'earned graph exceeds port bound');
    links.links.push(link); changedLinks.add(links.spaceId);
  }
  for (const spaceId of changedNodes) { const value = nodes.get(spaceId)!; graphNode(value); await storeGraph(pages, nodeKey(level, spaceId), value); }
  for (const spaceId of changedLinks) {
    const value = adjacency.get(spaceId)!; value.links.sort((a, b) => a.id.localeCompare(b.id)); graphLinks(value);
    await storeGraph(pages, linksKey(level, spaceId), value);
  }
  if (!existingFloor || changedNodes.size) { graphFloor(floor); await storeGraph(pages, fk, floor); }
}
