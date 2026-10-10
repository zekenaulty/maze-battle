// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { addressKey } from '../../address';
import { at, fixture } from '../planner.testSupport';
import type { StreamKnowledgePage } from '../types';
import { loadDirectedStreamKnowledge } from '../../../../services/expedition/directed/knowledge';
import { DirectedStreamKnowledge } from './knowledge';
import type { StreamDestination } from './types';

function chain(secondLength: number) {
  const first = fixture(300);
  const next: StreamKnowledgePage = { ...fixture(secondLength).page, spaceId: 'remembered-room', cells: {}, parentOpeningId: 'back' };
  for (let column = 0; column < secondLength; column++) {
    const cell = { ...at(column, next.spaceId), links: [...(column ? ['west' as const] : []),
      ...(column < secondLength - 1 ? ['east' as const] : [])], observedAt: 0 };
    next.cells[addressKey(cell)] = cell;
  }
  first.page.openings.forward = { ...at(0), id: 'forward', direction: 'north', observedAt: 0, destination: at(0, next.spaceId) };
  next.openings.back = { ...at(0, next.spaceId), id: 'back', direction: 'south', observedAt: 0, destination: at(0) };
  return { frame: { checkpoint: first.checkpoint, control: { sessionId: 'actor', epoch: 0 } },
    first: first.page, next, target: { kind: 'cell', address: at(secondLength - 1, next.spaceId), arrival: 'occupy' } as StreamDestination };
}

describe('learned-page actor projection', () => {
  it('admits exactly 512 aggregate cells and refuses the next page before copying beyond the bound', async () => {
    for (const length of [212, 213]) {
      const f = chain(length);
      const read = vi.fn(async (id: string) => structuredClone(id === 'entry' ? f.first : f.next));
      const loaded = await loadDirectedStreamKnowledge(f.frame, f.target, read);
      expect(loaded.diagnostics.cells).toBe(length === 212 ? 512 : 300);
      expect(loaded.diagnostics.geometryCells).toBe(0);
      expect(read.mock.calls.map(([id]) => id)).toEqual(['entry', 'remembered-room']);
      if (length === 212) expect(loaded.plan.status).toBe('ready');
      else expect(loaded.plan).toEqual({ status: 'unavailable', reason: 'Known-map budget exceeded.' });
    }
  });

  it('never routes into unseen local links or fetches an unlearned opening destination', async () => {
    const f = fixture(3);
    delete f.page.cells[addressKey(at(2))];
    f.page.openings.unknown = { ...at(0), id: 'unknown', direction: 'north', observedAt: 0 };
    const read = vi.fn(async () => f.page);
    const frame = { checkpoint: f.checkpoint, control: { sessionId: 'actor', epoch: 0 } };
    const unknown = await loadDirectedStreamKnowledge(frame, { kind: 'cell', address: at(2), arrival: 'occupy' }, read);
    expect(unknown.plan).toEqual({ status: 'unavailable', reason: 'Destination is not known.' });
    expect(read).toHaveBeenCalledTimes(1);
    const approach: StreamDestination = { kind: 'doorway', openingId: 'unknown', address: at(0), arrival: 'approach' };
    expect(unknown.knowledge.plan(at(1), approach).status).toBe('ready');
    expect(unknown.knowledge.plan(at(1), { ...approach, arrival: 'cross', destination: at(0, 'secret') }).status).toBe('unavailable');
  });

  it('supports approach to a pending observed frontier, without authority to prepare or cross it', () => {
    const f = fixture(3);
    f.page.frontiers.pending = { ...at(2), id: 'pending', direction: 'south', observedAt: 0 };
    const graph = new DirectedStreamKnowledge(f.checkpoint);
    graph.add(f.page, at(0));
    expect(graph.plan(at(0), { kind: 'doorway', openingId: 'pending', address: at(2), arrival: 'approach' }))
      .toMatchObject({ status: 'ready', route: [at(1), at(2)], distance: 2 });
    expect(graph.plan(at(0), { kind: 'doorway', openingId: 'pending', address: at(2), arrival: 'cross', destination: at(0, 'unknown') }).status)
      .toBe('unavailable');
  });

  it('rejects relocated chest identities, malformed links, missing pages and future page revisions', async () => {
    const f = fixture(3, [2]);
    const graph = new DirectedStreamKnowledge(f.checkpoint);
    graph.add(f.page, at(0));
    expect(graph.knows({ kind: 'chest', chestId: 'loot-2', address: at(1), arrival: 'occupy' })).toBe(false);
    const corrupt = structuredClone(f.page);
    corrupt.cells[addressKey(at(1))].links = ['east'];
    expect(() => new DirectedStreamKnowledge(f.checkpoint).add(corrupt, at(0))).toThrow(/Nonreciprocal/);
    expect(() => new DirectedStreamKnowledge(f.checkpoint).add({ ...f.page, revision: 1 }, at(0))).toThrow(/stale/);
    const c = chain(3);
    await expect(loadDirectedStreamKnowledge(c.frame, c.target, async id => id === 'entry' ? c.first : undefined))
      .rejects.toThrow(/unavailable/);
  });

  it('copies observed facts without retaining input pages or reading added host truth fields', () => {
    const f = fixture(3);
    const page = structuredClone(f.page);
    Object.defineProperty(page, 'world', { get: () => { throw new Error('Host truth accessed'); } });
    const graph = new DirectedStreamKnowledge(f.checkpoint);
    graph.add(page, at(0));
    page.cells[addressKey(at(0))].links = [];
    expect(graph.plan(at(0), { kind: 'cell', address: at(2), arrival: 'occupy' }))
      .toMatchObject({ status: 'ready', route: [at(1), at(2)] });
  });
});
