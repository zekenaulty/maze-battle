// @vitest-environment node
import { expect, it } from 'vitest';
import { branches, graphFixture } from '../../../persistence/canonical/knowledge/graph.roomConnections.test-support';
import { GraphCursorRefusal } from '../../../persistence/canonical/knowledge/graph.cursor';
import { gameCheckpoint } from '../../../persistence/canonical/game/checkpoint';
import { protocolHead } from '../../../persistence/canonical/agentica/types.test-support';
import { cursorAfter, inspectArgs, inspectionCursor, inspectQuery } from './validation';
import { inspectMaze } from './observation';
import { perceptionPublication } from './observation.test-support';

it('resolves explicit room selection and rejects cell coordinates or unrelated query fields', () => {
  const checkpoint = gameCheckpoint(protocolHead().checkpoint);
  expect(inspectQuery(inspectArgs({ scope: 'connections' }), checkpoint)).toEqual({ scope: 'connections',
    level: checkpoint.position.level, spaceId: checkpoint.position.cell.spaceId });
  expect(inspectQuery(inspectArgs({ scope: 'connections', level: 2, spaceId: 'remembered' }), checkpoint))
    .toEqual({ scope: 'connections', level: 2, spaceId: 'remembered' });
  for (const extra of [{ row: 0, column: 0 }, { row: 0 }, { status: 'active' }, { target: 'room' }, { limit: 4 }, { level: 0 }, { spaceId: '' }, { cursor: 'x'.repeat(1025) }])
    expect(() => inspectArgs({ scope: 'connections', ...extra })).toThrow();
});

it('binds both cursor layers to publication, knowledge, room and query; verifies member commitments', async () => {
  const memory = graphFixture(); await branches(memory); const f = perceptionPublication(memory);
  const args = { scope: 'connections' as const, level: 1, spaceId: 'origin' };
  const first = await inspectMaze(f.pages, f.snapshot, f.ref, args), cursor = first.data.next as string;
  const outer = JSON.parse(cursor), inner = JSON.parse(outer.after), anchor = memory.checkpoint().knowledge!;
  expect(cursorAfter(cursor, f.ref, args, anchor)).toBe(outer.after);
  for (const after of ['', 'x'.repeat(769), 1, '{', '{}', outer.after + ' ', JSON.stringify({ ...inner, extra: true }),
    JSON.stringify({ ...inner, scope: 'links' }), JSON.stringify({ ...inner, spaceId: 'other' }),
    JSON.stringify({ ...inner, anchor: { ...anchor, witness: 'other' } })])
    expect(() => cursorAfter(JSON.stringify({ ...outer, after }), f.ref, args, anchor)).toThrow();
  for (const query of [{ ...args, spaceId: 'other' }, { ...args, level: 2 }, { ...args, scope: 'links' as const }])
    expect(() => cursorAfter(cursor, f.ref, query, anchor)).toThrow('foreign');
  for (const after of [{ ...inner.after, spaceId: 'nonmember' }, { ...inner.after, digest: `sha256:${'0'.repeat(64)}` }]) {
    const changed = inspectionCursor(f.ref, args, JSON.stringify({ ...inner, after }));
    await expect(inspectMaze(f.pages, f.snapshot, f.ref, { ...args, cursor: changed })).rejects.toBeInstanceOf(GraphCursorRefusal);
  }
  f.republish();
  await expect(inspectMaze(f.pages, f.snapshot, f.ref, { ...args, cursor })).rejects.toThrow('foreign');
  expect(() => cursorAfter(cursor, f.ref, args, null)).toThrow();
  expect(() => inspectionCursor(f.ref, args, 'x'.repeat(1024))).toThrow('bound');
});
