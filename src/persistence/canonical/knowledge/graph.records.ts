import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { fields, id, natural } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { cellPosition, cellSource } from './validation';
import { cellKey } from './keys';
import { DIRECTIONS } from './types';
import type { GraphFloor, GraphLinks, GraphNode, KnownAnchor, KnownFilter, KnownLink } from './graph.types';

export const GRAPH_KEY = 'perception/graph';
export const floorKey = (level: number) => `${GRAPH_KEY}/floor/${level}`;
export const nodeKey = (level: number, spaceId: string) => `${GRAPH_KEY}/node/${level}/${spaceId}`;
export const linksKey = (level: number, spaceId: string) => `${GRAPH_KEY}/links/${level}/${spaceId}`;
export const FILTERS: readonly KnownFilter[] = ['all', 'room', 'passage'];
export function graphAnchor(value: unknown): asserts value is KnownAnchor {
  const a = fields(value, 'at world source'); cellPosition(a.at); cellSource(a.source);
  const w = fields(a.world, 'row column');
  check(Number.isSafeInteger(w.row) && Number.isSafeInteger(w.column), 'invalid graph world coordinate');
}
const pointer = (v: unknown) => { if (v !== null) id(v); };
export function graphNode(value: unknown): GraphNode {
  jsonBytes(value); const r = fields(value, 'schema node ordinal next'), n = fields(r.node, 'level spaceId kind anchor');
  natural(n.level, 1); id(n.spaceId); graphAnchor(n.anchor);
  check(r.schema === 1 && (n.kind === 'room' || n.kind === 'passage') && n.anchor.at.level === n.level
    && n.anchor.at.cell.spaceId === n.spaceId, 'invalid graph node');
  const o = fields(r.ordinal, 'all kind'), next = fields(r.next, 'all kind'); natural(o.all, 1); natural(o.kind, 1);
  pointer(next.all); pointer(next.kind);
  check(next.all !== n.spaceId && next.kind !== n.spaceId, 'cyclic graph index');
  return value as GraphNode;
}
export function graphFloor(value: unknown): GraphFloor {
  jsonBytes(value); const r = fields(value, 'schema level lists'); natural(r.level, 1);
  check(r.schema === 1, 'invalid graph floor'); const lists = fields(r.lists, 'all room passage');
  for (const kind of FILTERS) {
    const l = fields(lists[kind], 'first last count'); natural(l.count); pointer(l.first); pointer(l.last);
    check(l.count === 0 ? l.first === null && l.last === null : l.first !== null && l.last !== null
      && (l.count === 1 ? l.first === l.last : l.first !== l.last), 'invalid graph index endpoints');
  }
  const result = value as GraphFloor;
  check(result.lists.all.count === result.lists.room.count + result.lists.passage.count, 'invalid graph index count');
  return result;
}
export function graphMember(r: GraphNode, floor: GraphFloor) {
  check(r.node.level === floor.level, 'foreign graph member');
  for (const kind of ['all', r.node.kind] as const) {
    const list = floor.lists[kind], slot = kind === 'all' ? 'all' : 'kind', ordinal = r.ordinal[slot];
    check(ordinal <= list.count && (ordinal !== 1 || list.first === r.node.spaceId)
      && (ordinal === list.count ? list.last === r.node.spaceId && r.next[slot] === null
        : r.next[slot] !== null && list.last !== r.node.spaceId), 'broken graph index membership');
  }
}
export const linkId = (a: KnownAnchor, b: KnownAnchor) => bytesToHex(sha256(new TextEncoder().encode(
  canonicalJson([cellKey(a.at), cellKey(b.at)].sort()))));
export function graphLink(value: unknown): asserts value is KnownLink {
  const l = fields(value, 'id from to direction'); graphAnchor(l.from); graphAnchor(l.to);
  check(typeof l.direction === 'string' && DIRECTIONS.includes(l.direction as KnownLink['direction'])
    && l.id === linkId(l.from, l.to) && l.from.at.level === l.to.at.level
    && l.from.at.cell.spaceId !== l.to.at.cell.spaceId && l.from.source.id === l.to.source.id
    && l.from.source.sequence === l.to.source.sequence && l.from.source.index !== l.to.source.index, 'invalid graph link');
}
export function graphLinks(value: unknown): GraphLinks {
  jsonBytes(value); const r = fields(value, 'schema level spaceId links'); natural(r.level, 1); id(r.spaceId);
  check(r.schema === 1 && Array.isArray(r.links) && r.links.length <= 4, 'invalid graph adjacency bound');
  const ids = new Set<string>();
  for (const l of r.links) {
    graphLink(l); check(l.from.at.level === r.level && l.from.at.cell.spaceId === r.spaceId && !ids.has(l.id), 'foreign graph adjacency');
    ids.add(l.id);
  }
  return value as GraphLinks;
}
