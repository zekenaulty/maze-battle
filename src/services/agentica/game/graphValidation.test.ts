// @vitest-environment node
import { expect, it } from 'vitest';
import { protocolHead } from '../../../persistence/canonical/agentica/types.test-support';
import { gameCheckpoint } from '../../../persistence/canonical/game/checkpoint';
import { cursorAfter, inspectArgs, inspectionCursor, inspectQuery } from './validation';
import { graphCursor } from '../../../persistence/canonical/knowledge/graph.cursor';

const publication = { key: 'agentica/publications/current', id: 'current-publication' };

it('selects current or distant space connections without accepting a cell address', () => {
  const checkpoint = gameCheckpoint(protocolHead().checkpoint);
  expect(inspectQuery(inspectArgs({ scope: 'links' }), checkpoint)).toEqual({ scope: 'links',
    level: checkpoint.position.level, spaceId: checkpoint.position.cell.spaceId });
  expect(inspectQuery(inspectArgs({ scope: 'links', level: 2, spaceId: 'remembered' }), checkpoint))
    .toEqual({ scope: 'links', level: 2, spaceId: 'remembered' });
  for (const extra of [{ row: 1, column: 1 }, { row: 0 }, { kind: 'all' }, { level: 0 }])
    expect(() => inspectArgs({ scope: 'links', ...extra })).toThrow();
});

it('binds graph continuation to its original publication, selected space and scope', () => {
  const query = { scope: 'links' as const, level: 1, spaceId: 'known' };
  const anchor = { sequence: 1, id: 'observation', witness: 'witness' };
  const inner = graphCursor(anchor, query, 'a'.repeat(64));
  const cursor = inspectionCursor(publication, query, inner);
  expect(cursorAfter(cursor, publication, query, anchor)).toBe(inner);
  expect(() => cursorAfter(cursor, { ...publication, id: 'other' }, query, anchor)).toThrow('foreign');
  for (const other of [{ ...query, spaceId: 'elsewhere' }, { ...query, level: 2 }, { scope: 'map' as const, level: 1 }])
    expect(() => cursorAfter(cursor, publication, other, anchor)).toThrow('foreign');
  for (const after of ['', 'x'.repeat(769), 1])
    expect(() => cursorAfter(JSON.stringify({ schema: 1, publication, query, after }), publication, query, anchor)).toThrow('graph cursor');
  for (const after of ['not-json', '{}', graphCursor({ ...anchor, id: 'other' }, query, 'a'.repeat(64)),
    graphCursor(anchor, { ...query, spaceId: 'elsewhere' }, 'a'.repeat(64)), graphCursor(anchor, query, 'bad-link')])
    expect(() => cursorAfter(inspectionCursor(publication, query, after), publication, query, anchor)).toThrow();
});
