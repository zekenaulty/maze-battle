import { expect, it } from 'vitest';
import type { Occupancy } from '../../domain/expedition/topology/types';
import { PagedOccupancy } from './occupancy';

it('preserves staged bytes and dirty-bin order without rewriting fetched source records', async () => {
  const reservation: Occupancy = { id: 'socket', kind: 'reservation', bounds: { row: -1, column: 15, rows: 2, columns: 2 } };
  const source = [reservation], before = JSON.stringify(source);
  const pages = new PagedOccupancy();
  await pages.fetch(async () => source, [[-1, 0], [-1, 1], [0, 0], [0, 1]]);
  await pages.fetch(async () => undefined, [[1, 1]]);
  const writes: string[] = [];
  const stage = () => pages.stage((bucket, values) => { writes.push(JSON.stringify([bucket, values])); return Promise.resolve(); });
  await stage(); expect(writes).toEqual([]);

  pages.remove(reservation);
  pages.add({ ...reservation, id: 'room', kind: 'space' });
  await stage();
  const value = '[{"id":"room","kind":"space","bounds":{"row":-1,"column":15,"rows":2,"columns":2}}]';
  expect(writes).toEqual([`[[-1,0],${value}]`, `[[-1,1],${value}]`, `[[0,0],${value}]`, `[[0,1],${value}]`]);
  expect(JSON.stringify(source)).toBe(before);
});
