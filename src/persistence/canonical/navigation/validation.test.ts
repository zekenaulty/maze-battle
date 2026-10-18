import { describe, expect, it } from 'vitest';
import { createDestinationBinding, createFrontierBinding, destinationBinding, destinationProgress } from './validation';
import type { DestinationProgress } from './types';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { jsonBytes } from '../validation';

const target = { level: 1, cell: { spaceId: 'entry', row: 0, column: 1 } };
const frontier = () => ({ at: structuredClone(target), direction: 'east' as const, source: { sequence: 1, id: 'observed', index: 1 } });
const fixture = (): DestinationProgress => ({ schema: 1, operationId: 'trip', sourceAttemptId: 'admit', owner: 'owner', epoch: 1,
  binding: createDestinationBinding(target, { steps: null, replans: null, durationMs: null }), startedAt: 1000, deadline: null,
  sequence: 0, steps: 0, replans: 0, position: { ...target, cell: { ...target.cell, column: 0 } }, route: [{ direction: 'east', to: target }], status: 'running', reason: null });
describe('retained destination policy', () => {
  it('freezes existing default policy and preserves explicit unlimited values without legacy fallback', () => {
    expect(createDestinationBinding(target).limits).toEqual({ steps: 64, replans: 4, durationMs: 120000 });
    expect(destinationProgress(fixture())).toEqual(fixture());
    const p = fixture(); delete (p.binding as Partial<typeof p.binding>).limits;
    expect(() => destinationProgress(p)).toThrow();
    expect(() => destinationBinding({ ...fixture().binding, limits: undefined })).toThrow();
  });
  it.each([{ sequence: -1 }, { steps: 1 }, { replans: 1 }, { deadline: 0 }, { startedAt: -1 }, { status: 'cancelled' },
    { route: Array(17).fill({ direction: 'east', to: target }) }, { epoch: 0 }, { wholeGame: {} }])('rejects invalid retained fields %j', patch => {
    expect(() => destinationProgress({ ...fixture(), ...patch })).toThrow();
  });
  it('keeps maximal bounded route identifiers within the immutable receipt budget', () => {
    const p = fixture(); p.route = Array.from({ length: 16 }, () => ({ direction: 'east', to: { ...target, cell: { ...target.cell, spaceId: 'x'.repeat(128) } } }));
    destinationProgress(p);
    const row = { id: 'x'.repeat(128), revision: 1, gameId: 'g'.repeat(128), generation: 'v'.repeat(128), area: 'execution',
      key: 'navigation/destination/' + 't'.repeat(128), indexes: [], value: p };
    expect(jsonBytes({ recordId: row.id, recordWitness: canonicalJson(row) }, 16384)).toBeLessThan(16384);
  });
  it('retains a fixed source-qualified frontier without adding authority to ordinary destinations', () => {
    const input = frontier(), binding = createFrontierBinding(input, { steps: 12, replans: 2, durationMs: 1500 });
    input.at.cell.column = 20; input.source.id = 'changed';
    expect(binding).toEqual({ schema: 1, kind: 'frontier-approach', target, frontier: frontier(),
      limits: { steps: 12, replans: 2, durationMs: 1500 } });
    expect(destinationProgress({ ...fixture(), binding, deadline: 2500 })).toMatchObject({ binding });
    expect(() => destinationBinding({ ...createDestinationBinding(target), frontier: frontier() })).toThrow();
    expect(() => destinationBinding({ ...binding, frontier: { ...frontier(), at: { ...target, level: 2 } } })).toThrow();
    expect(() => destinationBinding({ ...binding, frontier: undefined })).toThrow();
    expect(() => destinationBinding({ ...binding, continuation: 'automatic' })).toThrow();
  });
  it('keeps frontier selection and maximal retained route under the existing receipt budget', () => {
    const selected = frontier(); selected.at.cell.spaceId = 's'.repeat(128); selected.source.id = 'k'.repeat(128);
    const p = fixture(); p.binding = createFrontierBinding(selected, p.binding.limits);
    p.route = Array.from({ length: 16 }, () => ({ direction: 'east', to: selected.at }));
    destinationProgress(p);
    const row = { id: 'x'.repeat(128), revision: 1, gameId: 'g'.repeat(128), generation: 'v'.repeat(128), area: 'execution',
      key: 'navigation/destination/' + 't'.repeat(128), indexes: [], value: p };
    expect(jsonBytes({ recordId: row.id, recordWitness: canonicalJson(row) }, 16384)).toBeLessThan(16384);
  });
});
