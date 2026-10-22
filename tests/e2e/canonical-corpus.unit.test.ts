import { describe, expect, it } from 'vitest';
import { qualityMemory, finishQuality } from '../../src/persistence/canonical/world/quality.test-support';
import { beginWorldRoomRoles, advanceWorldRoomRoles } from '../../src/persistence/canonical/world/roles';
import { beginWorldContent, advanceWorldContent } from '../../src/persistence/canonical/content/preparation';
import { observePosition } from '../../src/persistence/canonical/knowledge/observe';
import { resolveWorldStep } from '../../src/persistence/canonical/world/residency';
import { materializeSpace } from '../../src/domain/expedition/schematic';
import { corpusLayout, type CorpusVariant } from './canonical-corpus.layout';
import { seedCorpusWorld, authorSurveyContract } from './canonical-corpus.initialize';
import { corpusNormalizer } from './canonical-corpus.normalize';
import { corpusDifferences } from './canonical-corpus.diff';
import { observationFixture } from '../../src/persistence/canonical/knowledge/observation.test-support';

async function prepared(variant: CorpusVariant) {
  const m = qualityMemory(); await seedCorpusWorld(m.pages, variant);
  const quality = await finishQuality(m);
  await beginWorldRoomRoles(m.pages, 1); await advanceWorldRoomRoles(m.pages, 1);
  await beginWorldContent(m.pages, 1); await advanceWorldContent(m.pages, 1); await advanceWorldContent(m.pages, 1);
  const contract = await authorSurveyContract(m.pages);
  return { ...m, quality, contract };
}
describe('authored corpus uses current canonical primitives', () => {
  it.each(['A', 'B'] as const)('%s passes real quality, role, content and reciprocal movement rules', async variant => {
    const f = await prepared(variant), layout = corpusLayout(variant);
    expect(f.quality.status).toBe('qualified');
    expect(f.contract).toMatchObject({ objective: 'fetch', task: { required: 1, item: { baseId: 'survey-seal' } } });
    const occupied = new Set<string>();
    for (const space of layout.spaces) for (const cell of materializeSpace(space).cells) {
      const key = `${space.origin.row + cell.row}:${space.origin.column + cell.column}`;
      expect(occupied.has(key)).toBe(false); occupied.add(key);
    }
    for (const link of layout.connections) {
      const result = await resolveWorldStep(f.pages, { level: 1, cell: link.from }, link.direction);
      expect(result).toEqual({ moved: true, crossed: true, position: { level: 1, cell: link.to } });
    }
    expect([...f.rows.keys()].some(key => key.startsWith('perception/') || key.startsWith('quest/'))).toBe(false);
  });
  it('initial ordinary sight is identical and cannot see the junction or chest', async () => {
    const a = await prepared('A'), b = await prepared('B'), at = { level: 1, cell: corpusLayout('A').floor.entry };
    const first = await observePosition(a.pages, at), second = await observePosition(b.pages, at);
    expect(first).toEqual(second);
    expect(new Set(first.map(cell => cell.at.cell.spaceId))).toEqual(new Set(['entry', 'socket-0:passage']));
    expect(first.some(cell => cell.stairs.includes('town'))).toBe(true);
    expect(first.flatMap(cell => cell.chests)).toEqual([]);
  });
  it('normal sight at the junction earns opposite walls without revealing the later chest', async () => {
    const a = await prepared('A'), b = await prepared('B'), at = { level: 1, cell: { spaceId: 'socket-0:room', row: 2, column: 2 } };
    const first = await observePosition(a.pages, at), second = await observePosition(b.pages, at);
    const east = (cells: typeof first) => cells.find(c => c.at.cell.spaceId === at.cell.spaceId && c.at.cell.row === 2 && c.at.cell.column === 4)!;
    const north = (cells: typeof first) => cells.find(c => c.at.cell.spaceId === at.cell.spaceId && c.at.cell.row === 0 && c.at.cell.column === 2)!;
    expect(east(first).edges.east).not.toBeNull(); expect(north(first).edges.north).toBeNull();
    expect(east(second).edges.east).toBeNull(); expect(north(second).edges.north).not.toBeNull();
    expect([...first, ...second].flatMap(cell => cell.chests)).toEqual([]);
  });
  it('rejects unknown variants before any initialization', () => {
    expect(() => corpusLayout('C' as CorpusVariant)).toThrow('Unknown corpus');
  });
  it('normalizes only designated identities, retaining semantic facts and source ordering', () => {
    const n = corpusNormalizer();
    expect(n.normalize({ source: { sequence: 1, id: 'source-a', index: 2 }, again: { sequence: 1, id: 'source-a' } }))
      .toEqual({ source: { sequence: 1, id: 'identity-0', index: 2 }, again: { sequence: 1, id: 'identity-0' } });
    expect(n.normalize({ sequence: 1, id: 'source-a', revision: 9, observedAt: 'fixed-time' }))
      .toEqual({ sequence: 1, id: 'identity-0', revision: 9, observedAt: 'fixed-time' });
    const semantic = { id: 'quest-room-secret', at: { row: -12, column: 2 }, count: 7, revision: 3,
      status: 'unknown', observedAt: '2026-10-20T12:00:00.000Z', cost: 4 };
    expect(n.normalize(semantic)).toEqual(semantic);
  });
  it('does not normalize opaque tokens without their exact publication-scoped structure', () => {
    expect(() => corpusNormalizer().normalize({ frontier: '{"schema":1,"hidden":"answer"}' })).toThrow('Unrecognized');
  });
  it('retains every cost, coordinate and error difference in native evidence', () => {
    const left = { readBytes: 10, reads: 1, at: { row: -1 }, error: 'first', quota: { usedBytes: 99 } };
    const right = { readBytes: 11, reads: 2, at: { row: 1 }, error: 'second', quota: { usedBytes: 100 } };
    expect(corpusDifferences(left, right)).toEqual([
      ['/readBytes', 10, 11], ['/reads', 1, 2], ['/at/row', -1, 1], ['/error', 'first', 'second'], ['/quota/usedBytes', 99, 100],
    ].map(([path, a, b]) => ({ path, left: { present: true, value: a }, right: { present: true, value: b } })));
    expect(corpusNormalizer().normalize(left)).toEqual(left);
    expect(corpusNormalizer().normalize(right)).toEqual(right);
  });
  it('normalizes private full-record commitments only in the validated sight header', async () => {
    const a = await observationFixture(1), b = await observationFixture(1);
    const left = { sight: { header: a.header, cells: a.cells } }, right = { sight: { header: b.header, cells: b.cells } };
    expect(a.header.chunksDigest).not.toBe(b.header.chunksDigest);
    expect(corpusNormalizer().normalize(left)).toEqual(corpusNormalizer().normalize(right));
    right.sight.cells[0].chests[0].opened = true;
    expect(corpusNormalizer().normalize(left)).not.toEqual(corpusNormalizer().normalize(right));
    const unrelated = { header: { owner: 'semantic', chunks: ['semantic'], chunksDigest: a.header.chunksDigest } };
    expect(corpusNormalizer().normalize(unrelated)).toEqual(unrelated);
    expect(() => corpusNormalizer().normalize({ sight: { header: { ...a.header, chunksDigest: 'invalid' } } })).toThrow();
  });
  it('normalizes only sourced identities inside graph cursors, retaining scope and semantic links', () => {
    const cursor = (id: string, link = 'a'.repeat(64)) => ({ next: JSON.stringify({ schema: 1,
      publication: { key: `agentica/publications/${id}`, id }, query: { scope: 'links', level: 1, spaceId: 'known' },
      after: JSON.stringify({ schema: 1, scope: 'links', level: 1, spaceId: 'known',
        anchor: { sequence: 5, id, witness: `witness-${id}` }, after: link }) }) });
    const left = corpusNormalizer().normalize(cursor('left'));
    expect(left).toEqual(corpusNormalizer().normalize(cursor('right')));
    expect(left).not.toEqual(corpusNormalizer().normalize(cursor('right', 'b'.repeat(64))));
    expect(() => corpusNormalizer().normalize(cursor('right', 'invalid'))).toThrow();
    const untouched = { anchor: { sequence: 5, id: 'semantic', witness: 'semantic' }, after: 'opaque' };
    expect(corpusNormalizer().normalize(untouched)).toEqual(untouched);
    const nested = { after: { anchor: { sequence: 5, id: 'semantic-a', witness: 'semantic-b' } } };
    expect(corpusNormalizer().normalize(nested)).toEqual(nested);
  });
  it('retains missing fields, array order, types and escaped evidence paths', () => {
    expect(corpusDifferences({ 'a/b~': undefined }, {})).toEqual([{ path: '/a~1b~0',
      left: { present: true, value: undefined }, right: { present: false, value: undefined } }]);
    expect(corpusDifferences([1, 2], [2, 1]).map(diff => diff.path)).toEqual(['/0', '/1']);
    expect(corpusDifferences([], {})).toHaveLength(1);
    expect(corpusDifferences({ rows: [1, 2] }, { rows: [1, 2] })).toEqual([]);
  });
});
