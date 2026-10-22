import type { Direction } from '../../../domain/types';
import { opposite } from '../../../domain/maze/movement';
import { jsonBytes } from '../validation';
import { cellKey } from './keys';
import { earnedCell, graphFixture } from './graph.test-support';
import type { KnowledgeRead, ObservedCell, ObservedSpace } from './types';

export { graphFixture };
export const roomScope = { level: 1, spaceId: 'origin' };
export const cell = (row: number, column: number, spaceId: string) =>
  ({ ...earnedCell(row, column, spaceId, row, column), chests: [] });
export function join(a: ObservedCell, b: ObservedCell, direction: Direction = 'east') {
  a.edges[direction] = b.at; b.edges[opposite(direction)] = a.at;
}
/** Explicit unit sight with real graph/memory writers, not world generation or native qualification. */
export async function observe(f: ReturnType<typeof graphFixture>, input: ObservedCell[], rooms = ['origin', 'target']) {
  const cells = structuredClone(input), visible = new Set(cells.map(c => cellKey(c.at)));
  for (const c of cells) for (const [d, to] of Object.entries(c.edges)) if (to && !visible.has(cellKey(to))) delete c.edges[d as Direction];
  const spaces: ObservedSpace[] = [...new Set(cells.map(c => c.at.cell.spaceId))].map(spaceId =>
    ({ spaceId, kind: rooms.includes(spaceId) ? 'room' : 'passage', index: cells.findIndex(c => c.at.cell.spaceId === spaceId) }));
  return f.observe(cells, spaces);
}
export function chain(passages = 2, width = 2) {
  const cells = [cell(0, 0, 'origin')];
  for (let n = 0; n < passages * width; n++) cells.push(cell(0, n + 1, `room-label-${Math.floor(n / width)}`));
  cells.push(cell(0, cells.length, 'target'));
  for (let n = 1; n < cells.length; n++) join(cells[n - 1], cells[n]);
  return cells;
}
export async function branches(f: ReturnType<typeof graphFixture>) {
  const root = cell(2, 2, 'origin'), north = cell(1, 2, 'a'), east = cell(2, 3, 'b'), south = cell(3, 2, 'c');
  const p = cell(2, 1, 'passage'), west = cell(2, 0, 'd'), nw = cell(1, 1, 'e'), sw = cell(3, 1, 'f');
  join(root, north, 'north'); join(root, east); join(root, south, 'south'); join(root, p, 'west');
  join(p, west, 'west'); join(p, nw, 'north'); join(p, sw, 'south');
  const cells = [root, north, east, south, p, west, nw, sw];
  await observe(f, cells, ['origin', 'a', 'b', 'c', 'd', 'e', 'f']); return cells;
}
export function meter(input: KnowledgeRead) {
  let reads = 0, bytes = 0; const keys: string[] = [];
  const charge = <T>(v: T) => { bytes += v === undefined ? 0 : jsonBytes(v, 2 * 1024 * 1024); return v; };
  const pages: KnowledgeRead = {
    async get(area, key) { reads++; keys.push(`${area}:${key}`); return charge(await input.get(area, key)); },
    async witness(area, prefix) { reads++; keys.push(`${area}:witness:${prefix}`); return charge(await input.witness(area, prefix)); },
    async scan() { throw Error('No scans'); },
  };
  return { pages, keys, counts: () => ({ reads, bytes }) };
}
