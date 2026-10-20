import { expect } from 'vitest';
import { earnedCell, knowledgeFixture } from './region.test-support';
import { blockKey, localKey, observationKey } from './keys';
import type { MemoryBlock, ObservationHeader, ObservedCell } from './types';
import { readTownReturn } from './townReturn';

export const townCell = (): ObservedCell => ({ ...earnedCell(), stairs: ['town'] });
export const awayCell = () => earnedCell(100, 100, 'away');
export async function returnFixture(away = true) {
  const f = knowledgeFixture(), town = townCell();
  await f.observe([town]); const original = f.checkpoint().knowledge!;
  if (away) await f.observe([awayCell()]);
  return { ...f, town, original };
}
export const header = (f: ReturnType<typeof knowledgeFixture>, sequence = 1) =>
  f.records.get(observationKey(sequence))!.value as unknown as ObservationHeader;
export const cells = (f: ReturnType<typeof knowledgeFixture>, sequence = 1) =>
  (f.records.get(`${observationKey(sequence)}/0`)!.value as unknown as { cells: ObservedCell[] }).cells;
export const memory = (f: Awaited<ReturnType<typeof returnFixture>>) =>
  (f.records.get(blockKey(f.town.at))!.value as unknown as MemoryBlock).cells[localKey(f.town.at)];

export async function refuses(f: ReturnType<typeof knowledgeFixture>, message: RegExp) {
  const before = structuredClone(f.records), writes = f.writes.length;
  await expect(readTownReturn(f.pages, f.checkpoint())).rejects.toThrow(message);
  expect(f.records).toEqual(before); expect(f.writes).toHaveLength(writes);
}
