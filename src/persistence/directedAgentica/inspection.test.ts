import { expect, it } from 'vitest';
import { validateArchivedInspection } from './inspection';
const address = { spaceId: 'room', row: 1, column: 1 };
const inspection = { historical: true, pageRevision: 10, cell: { ...address, observedAt: 7, links: ['north'] },
  chests: [{ ...address, observedAt: 6, id: 'chest', opened: false }], openings: [] };
it('retains valid historical inspection without refreshing its timestamps', () => {
  const old = structuredClone(inspection);
  expect(() => validateArchivedInspection(inspection, 20)).not.toThrow();
  expect(inspection).toEqual(old);
});
it.each([
  { ...inspection, cell: { ...inspection.cell, row: -1 } },
  { ...inspection, cell: { ...inspection.cell, links: ['teleport'] } },
  { ...inspection, chests: [{ ...inspection.chests[0], authoritative: 'hidden' }] },
  { ...inspection, chests: [{ ...inspection.chests[0], opened: 'no' }] },
  { ...inspection, openings: [{ ...address, id: 'port', direction: 'east', observedAt: 11 }] },
  { ...inspection, openings: [{ ...address, id: 'port', direction: 'east', observedAt: 8, destination: { ...address, secret: true } }] },
])('rejects malformed or privileged nested archived evidence', invalid => {
  expect(() => validateArchivedInspection(invalid, 20)).toThrow();
});
