// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { earnedCell } from '../../../persistence/canonical/knowledge/region.test-support';
import { encodeFrontier, parseFrontier, MAX_FRONTIER_TOKEN_LENGTH } from './frontierSelection';

const publication = { key: 'agentica/publications/one', id: 'publication' };
const selection = { at: earnedCell().at, direction: 'east' as const, source: { sequence: 1, id: 'sight', index: 1 } };
describe('publication-scoped frontier tokens', () => {
  it('round-trips strict selection without storage, mutation or authority', () => {
    const token = encodeFrontier(publication, selection), decoded = parseFrontier(token, publication);
    expect(JSON.parse(token)).toEqual({ schema: 1, publication, selection }); expect(decoded).toEqual(selection);
    expect(encodeFrontier({ id: publication.id, key: publication.key }, { source: selection.source, direction: selection.direction, at: selection.at })).toBe(token);
    decoded.at.cell.row = 3; expect(selection.at.cell.row).toBe(0); expect(token.length).toBeLessThanOrEqual(MAX_FRONTIER_TOKEN_LENGTH);
  });
  it('rejects another publication key or replacement ID', () => {
    const token = encodeFrontier(publication, selection);
    for (const other of [{ ...publication, key: 'agentica/publications/two' }, { ...publication, id: 'replaced' }])
      expect(() => parseFrontier(token, other)).toThrow('publication');
  });
  it.each([null, {}, '', 'not-json', ' '.repeat(MAX_FRONTIER_TOKEN_LENGTH + 1)])('rejects invalid or oversized wire input %j', input => {
    expect(() => parseFrontier(input, publication)).toThrow();
  });
  it.each([{ schema: 2 }, { extra: true }, { publication: { ...publication, extra: true } },
    { selection: { ...selection, extra: true } }, { selection: { ...selection, direction: 'up' } },
    { selection: { ...selection, at: { ...selection.at, truth: true } } },
    { selection: { ...selection, source: { ...selection.source, witness: 'not-cell-source' } } }])('rejects nonexact fields %j', mutation => {
    expect(() => parseFrontier(JSON.stringify({ schema: 1, publication, selection, ...mutation }), publication)).toThrow();
  });
  it('supports maximal legal identity fields within the documented token bound', () => {
    const long = 'x'.repeat(128), ref = { key: `agentica/publications/${long}`, id: long };
    const value = { ...selection, at: { level: Number.MAX_SAFE_INTEGER, cell: { spaceId: long, row: 511, column: 511 } },
      source: { sequence: Number.MAX_SAFE_INTEGER, id: long, index: 112 } };
    const token = encodeFrontier(ref, value); expect(token.length).toBeLessThanOrEqual(MAX_FRONTIER_TOKEN_LENGTH);
    expect(parseFrontier(token, ref)).toEqual(value);
  });
});
