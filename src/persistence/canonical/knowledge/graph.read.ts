import { gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { check, jsonBytes } from '../validation';
import { same } from '../world/records';
import { validateKnowledge } from './evidence';
import { graphSources } from './graph.evidence';
import { floorKey, graphFloor, graphLinks, graphMember, graphNode, linksKey, nodeKey } from './graph.records';
import { graphAvailable, graphRecord } from './graph.storage';
import { KnownGraphUnavailableError } from './graph.types';
import { roomKey } from './keys';
import { readKnownCells } from './queries';
import type { KnowledgeRead } from './types';

// Logical point reads, including original sources; canonical transaction IO caps remain unchanged.
export function graphPages(input: KnowledgeRead): KnowledgeRead {
  const get = input.get.bind(input), witness = input.witness.bind(input);
  const cache = new Map<string, Awaited<ReturnType<KnowledgeRead['get']>>>();
  let reads = 0, bytes = 0;
  const read = () => check(++reads <= 256, 'graph read budget exhausted');
  function charge<T>(value: T) {
    bytes += value === undefined ? 0 : jsonBytes(value, 1024 * 1024);
    check(bytes <= 1024 * 1024, 'graph byte budget exhausted'); return value;
  }
  return {
    async get(area, key) {
      check(area === 'knowledge', 'graph requires knowledge only');
      if (!cache.has(key)) { read(); cache.set(key, charge(await get(area, key))); }
      return structuredClone(cache.get(key));
    },
    async witness(area, prefix) { check(area === 'knowledge', 'graph requires knowledge only'); read(); return charge(await witness(area, prefix)); },
    async scan() { throw Error('Known graph cannot scan'); },
  };
}
export async function graphView(input: KnowledgeRead, before: GameCheckpoint, level: number) {
  const checkpoint = gameCheckpoint(before), pages = graphPages(input), anchor = checkpoint.knowledge;
  await validateKnowledge(pages, anchor);
  if (!await graphAvailable(pages, anchor)) throw new KnownGraphUnavailableError();
  check(anchor, 'missing graph checkpoint');
  const record = await graphRecord(pages, floorKey(level)), floor = record ? graphFloor(record.value) : null;
  check(!floor || floor.level === level, 'foreign graph floor');
  check(floor || checkpoint.position.level !== level, 'current floor is missing from graph');
  const evidence = graphSources(pages, anchor.sequence);
  async function node(spaceId: string) {
    const row = await graphRecord(pages, nodeKey(level, spaceId));
    if (!row) { check(!await pages.get('knowledge', roomKey(level, spaceId)), 'known space is missing from graph'); return null; }
    const r = graphNode(row.value), n = r.node;
    check(floor && n.level === level && n.spaceId === spaceId, 'foreign graph node');
    graphMember(r, floor);
    await evidence.node(n);
    const [known] = await readKnownCells(pages, checkpoint, [n.anchor.at]);
    check(known.state !== 'unknown' && same(known.cell.world, n.anchor.world), 'graph anchor is missing from current memory');
    return r;
  }
  async function links(spaceId: string) {
    const row = await graphRecord(pages, linksKey(level, spaceId)); check(row, 'missing graph adjacency');
    const value = graphLinks(row.value); check(value.level === level && value.spaceId === spaceId, 'foreign graph adjacency');
    return value;
  }
  return { pages, checkpoint, anchor, floor, evidence, node, links };
}
