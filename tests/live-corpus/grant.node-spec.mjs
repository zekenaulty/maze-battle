import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RepairGrant, WINDOW_RESERVE_USD, CALL_RESERVE_USD } from './grant.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maze-repair-grant-')), file = path.join(dir, 'grant.json');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return file;
}
test('fresh owner grant persists actual spend across coordinator retries', t => {
  const file = fixture(t), first = new RepairGrant(file);
  first.reserve('one', 'attempt-A'); assert.equal(first.snapshot().committedUsd, WINDOW_RESERVE_USD);
  first.settle('one', [{ terminal: 'completed', usage: { promptTokens: 4201, outputTokens: 681 } }], 1); first.close();
  const next = new RepairGrant(file); t.after(() => next.close());
  assert.equal(next.snapshot().approvedUsd, 4); assert.equal(next.snapshot().committedUsd, 0.0007606000000000001);
  next.reserve('two', 'attempt-A-repaired'); assert.equal(next.snapshot().windows.length, 2);
});
test('cancelled and missing attempts retain conservative charges without revoking the grant', t => {
  const g = new RepairGrant(fixture(t)); t.after(() => g.close());
  g.reserve('one', 'interrupted'); g.settle('one', [{ terminal: 'cancelled', usage: null }], 2);
  assert.equal(g.snapshot().committedUsd, 2 * CALL_RESERVE_USD);
  assert.equal(g.snapshot().windows[0].unknownCalls, 2); g.reserve('retry', 'new-proof');
});
test('unreconciled windows remain reserved and cannot silently reset or exceed the grant', t => {
  const file = fixture(t), g = new RepairGrant(file);
  g.reserve('one', 'one'); assert.throws(() => g.settle('one', [], -1), /not reconciled/); g.close();
  const next = new RepairGrant(file); t.after(() => next.close());
  assert.equal(next.snapshot().committedUsd, WINDOW_RESERVE_USD);
  next.reserve('two', 'two'); next.reserve('three', 'three');
  assert.throws(() => next.reserve('four', 'four'), /cannot fund/);
});
test('two coordinators cannot spend the same retained grant concurrently', t => {
  const file = fixture(t), g = new RepairGrant(file); t.after(() => g.close());
  assert.throws(() => new RepairGrant(file), /Another live-test coordinator/);
});

test('corrupt rows, nonfinite charges and altered settled usage cannot bypass admission', t => {
  for (const mutate of [state => state.windows.push({}), state => { state.windows[0].chargedUsd = -1; },
    state => { state.windows[0].chargedUsd = 0; }]) {
    const file = fixture(t), g = new RepairGrant(file);
    g.reserve('one', 'one'); g.settle('one', [{ terminal: 'completed', usage: { promptTokens: 10, outputTokens: 10 } }], 1); g.close();
    const state = JSON.parse(fs.readFileSync(file)); mutate(state); fs.writeFileSync(file, JSON.stringify(state));
    assert.throws(() => new RepairGrant(file), /Invalid|differs/);
  }
});

test('retained dead-owner locks are not deleted during concurrent admission', t => {
  const file = fixture(t), lock = `${file}.lock`;
  fs.writeFileSync(lock, JSON.stringify({ pid: 2147483647 }));
  assert.throws(() => new RepairGrant(file), /retained lock/);
  assert.equal(JSON.parse(fs.readFileSync(lock)).pid, 2147483647);
});
