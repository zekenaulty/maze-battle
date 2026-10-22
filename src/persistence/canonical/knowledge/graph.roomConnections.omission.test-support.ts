import { cell, chain, graphFixture, join, observe } from './graph.roomConnections.test-support';
import { blockKey, localKey } from './keys';
import type { MemoryBlock } from './types';

export async function omittedEdgeFixture(direction: 'east' | 'north', newer: 'none' | 'retained' | 'sole') {
  const f = graphFixture(), cells = chain(1, 3);
  for (const c of cells) { c.world.row++; c.at.cell.row++; }
  await observe(f, cells);
  // The selected cell is not the passage's first-observed anchor.
  const selected = cells[2];
  if (newer !== 'none') {
    const next = structuredClone(selected), side = cell(2, 2, next.at.cell.spaceId);
    delete next.edges[direction]; join(next, side, 'south');
    const seen = [next, side];
    if (newer === 'sole') seen.push(cells[1]); // Renew every remaining direction's receipt.
    if (direction === 'north') seen.push(cells[3]);
    await observe(f, seen);
  }
  await observe(f, [cell(30, 30, 'away')], ['away']);
  const record = f.records.get(blockKey(selected.at))!;
  const remembered = (record.value as unknown as MemoryBlock).cells[localKey(selected.at)];
  return { ...f, record, remembered, selected };
}

/** The omitted receipt is neither the graph origin nor any currently reachable cell/edge source. */
export async function isolatedOlderEdgeFixture(direction: 'east' | 'north') {
  const f = graphFixture(), cells = chain(1, 3);
  for (const c of cells) { c.world.row++; c.at.cell.row++; }
  const prefix = structuredClone(cells.slice(0, 3)); delete prefix[2].edges.north;
  await observe(f, prefix); await observe(f, cells.slice(3));
  await observe(f, cells.slice(1, 4)); // Receipt 3 first proves the selected east edge and north wall.
  const selected = cells[2], next = structuredClone(selected), side = cell(2, 2, selected.at.cell.spaceId);
  delete next.edges[direction]; join(next, side, 'south');
  const seen = [next, side, cells[1]];
  if (direction === 'north') {
    const adjacent = structuredClone(cells[3]), otherSide = cell(2, 3, selected.at.cell.spaceId);
    join(adjacent, otherSide, 'south'); seen.push(adjacent, otherSide, cells[4]);
  }
  await observe(f, seen); await observe(f, [cell(30, 30, 'away')], ['away']);
  const record = f.records.get(blockKey(selected.at))!;
  const remembered = (record.value as unknown as MemoryBlock).cells[localKey(selected.at)];
  return { ...f, record, remembered, selected };
}
