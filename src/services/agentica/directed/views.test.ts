import { describe, expect, it, vi } from 'vitest';
import { planningFixture } from '../../expedition/planning/testSupport';
import { mapView } from './mapView';
import { roomView } from './roomView';
import { validateContextEvidence } from '../../../persistence/directedAgentica/contextEvidence';
import type { StreamKnowledgePage } from '../../../domain/expedition/streaming/types';

describe('on-demand context scopes', () => {
  it('paginates room cells and objects without dropping or duplicating cells or refreshing evidence', async () => {
    const page = (await planningFixture().host.read()).knowledge, original = structuredClone(page);
    const first = roomView(page, 0, 16), second = roomView(page, first.nextOffset!, 16);
    expect(first.cells).toHaveLength(16); expect(first.nextOffset).toBe(16);
    expect(second.offset).toBe(16);
    expect(new Set([...first.cells, ...second.cells].map(cell => `${cell.row},${cell.column}`)).size).toBe(32);
    expect(() => validateContextEvidence(first, page.revision)).not.toThrow();
    expect(() => validateContextEvidence(second, page.revision)).not.toThrow();
    expect(page).toEqual(original);
    const corrupt = { ...first, cells: first.cells.map(cell => ({ ...cell, hiddenTrap: true })) };
    expect(() => validateContextEvidence(corrupt, page.revision)).toThrow();
  });
  it('maps rooms without cell grids and bounds reads before loading another room', async () => {
    const base = (await planningFixture().host.read()).knowledge;
    const make = (id: string, next?: string): StreamKnowledgePage => ({ ...structuredClone(base), spaceId: id,
      openings: next ? { door: { id: 'door', spaceId: id, row: 4, column: 4, direction: 'east',
        observedAt: 0, destination: { spaceId: next, row: 0, column: 0 } } } : {} });
    const pages: Record<string, StreamKnowledgePage> = { A: make('A', 'B'), B: make('B', 'C'), C: make('C', 'D') };
    const read = vi.fn(async (id: string) => pages[id]);
    const map = await mapView('A', 3, 2, read);
    expect(read.mock.calls.map(([id]) => id)).toEqual(['A', 'B']);
    expect(map.rooms.map(room => room.roomId)).toEqual(['A', 'B']);
    expect(map.boundaryRoomIds).toEqual(['C']);
    expect(JSON.stringify(map)).not.toMatch(/"(?:cells|row|column|seed|recipe)"/);
    expect(() => validateContextEvidence(map, base.revision)).not.toThrow();
    expect(() => validateContextEvidence({ ...map, rooms: map.rooms.map(room => ({ ...room, cells: [] })) }, base.revision)).toThrow();
    read.mockClear();
    expect((await mapView('C', 0, 12, read)).rooms).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('unknown map lookups return no topology and never expand or scan', async () => {
    const read = vi.fn(async () => undefined);
    const result = await mapView('unknown', 3, 12, read);
    expect(result).toMatchObject({ status: 'unknown', rooms: [], boundaryRoomIds: [] });
    expect(read).toHaveBeenCalledTimes(1);
    expect(() => validateContextEvidence(result, 0)).not.toThrow();
    expect(() => validateContextEvidence({ kind: 'room', status: 'unknown', spaceId: 'unknown' }, 0)).not.toThrow();
  });
});
