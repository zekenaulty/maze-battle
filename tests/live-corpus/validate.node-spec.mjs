import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCompletion } from './validate.mjs';

test('equivalent return positions are independent of property insertion order', () => {
  const record = { setup: { position: { level: 1, cell: { spaceId: 'entry', row: 2, column: 2 } } },
    final: { checkpoint: { position: { cell: { column: 2, row: 2, spaceId: 'entry' }, level: 1 } },
      questItems: [{ quantity: 1 }], chest: { chest: { opened: true } }, quest: { quest: { status: 'complete' } } },
    wire: { sent: [{ frame: { type: 'action.result', payload: { completion: {}, observation: { data: { status: 'satisfied' } } } } }] } };
  assert.equal(validateCompletion(record).status, 'SATISFIED');
  record.final.checkpoint.position.cell.column = 3;
  assert.throws(() => validateCompletion(record), /entrance/);
});
