import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorker } from './worker-output.mjs';
import { runBounded } from './bounded-process.mjs';
const start = { type: 'start', cohort: 'domain', manifest: ['a', 'b'] };
const row = id => ({ type: 'row', row: { id, status: 'complete' } });
const output = records => ({ stdout: records.map(value => JSON.stringify(value)).join('\n'), status: 0 });
test('requires exact complete manifest', () => {
  assert.equal(parseWorker('domain', output([start, row('a'), row('b'), { type: 'complete' }])).status, 'complete');
});
test('timeout preserves completed row and records missing fixture as infeasible', () => {
  const result = parseWorker('domain', { ...output([start, row('a')]), status: null, error: new Error('ETIMEDOUT') });
  assert.equal(result.status, 'failed');
  assert.equal(result.rows[0].status, 'complete');
  assert.equal(result.rows[1].status, 'infeasible');
});
test('rejects duplicates, unexpected rows and truncated JSON', () => {
  for (const result of [output([start, row('a'), row('a'), { type: 'complete' }]), output([start, row('x')]), { stdout: '{', status: 0 }]) {
    assert.equal(parseWorker('domain', result).status, 'failed');
  }
});
test('row partial is not complete', () => {
  assert.equal(parseWorker('domain', output([start, row('a'), { type: 'row', row: { id: 'b', status: 'partial' } }, { type: 'complete' }])).status, 'partial');
});
test('subprocess wall budget terminates a stuck worker and retains output', async () => {
  const result = await runBounded(['-e', 'console.log("ready"); setInterval(() => {}, 1000)'], 500);
  assert.match(String(result.error), /wall timeout/);
  assert.match(result.stdout, /ready/);
  assert.notEqual(result.status, 0);
});
