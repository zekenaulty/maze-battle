import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questPlan, validateQuestSequence } from './rpg-quest-provider.mjs';
import { discoveryPlan } from './rpg-discovery-provider.mjs';

const scope = '00000000-0000-4000-8000-000000000000', address = { floor: 1, row: 0, column: 0 };
function request(patch = {}) {
  const frame = { kind: 'local', scopeId: scope, perspectiveId: 'party', gameId: 'game', floor: 1, actor: address,
    sourceHead: { id: 'source', gameId: 'game' }, cells: [{ address, chests: [] }],
    quest: { kind: 'retrieval', status: 'active', item: { name: 'Survey Seal' }, required: 1, carried: 0, returnTarget: address, complete: false }, ...patch };
  const payload = { identity: { HostId: 'maze-battle', ScopeId: scope, SessionEpoch: '1', PerspectiveId: 'party' },
    currentObservation: { Reference: { ObservationId: 'observation', Revision: 1 }, Data: frame } };
  return { model: 'fixture-model', stream: true, store: false, input: [{ role: 'user', content:
    `Objective:\nRetrieve the accepted quest collectible and return to the known entrance.\nOrigin:\nfixture\nProjected context frames:\n${JSON.stringify([{ payload }])}\nCurrent planning constraints:\n{}` }] };
}
test('retrieval chooses opposite public frontiers, not a fixture variant or hidden quest target', () => {
  assert.equal(questPlan(request(), 1).tool, 'maze.frontiers');
  for (const direction of ['east', 'north']) {
    const record = questPlan(request({ context: { kind: 'frontiers', status: 'ready', floor: 1, snapshotId: 'source',
      frontiers: [{ anchor: { floor: 1, row: 1, column: 1 }, direction, source: { id: 'source' } }] } }), 2);
    assert.deepEqual(record.input, { row: 1, column: 1, direction, sourceId: 'source', continuation: 'corridor-v1' });
  }
});
test('observed chest approach, explicit interaction and own-pack return are separate intentions', () => {
  const position = { ...address, column: 2 }, chest = { id: 'chest', position, opened: false };
  const cells = [{ address: position, chests: [chest] }];
  const travel = questPlan(request({ cells }), 1);
  assert.equal(travel.tool, 'maze.navigate'); assert.deepEqual(travel.input, { row: 0, column: 2 });
  const open = questPlan(request({ cells, actor: position }), 2);
  assert.equal(open.tool, 'maze.open-chest'); assert.deepEqual(open.input, { chestId: 'chest' });
  assert.deepEqual(JSON.parse(open.text).steps.map(s => s.toolId), ['maze.open-chest']);
  const done = questPlan(request({ actor: position, quest: { kind: 'retrieval', status: 'complete', required: 1,
    carried: 1, complete: false, returnTarget: address } }), 3);
  assert.equal(done.tool, 'maze.navigate'); assert.deepEqual(done.input, { row: 0, column: 0 });
});
test('unknown/invalid facts and wrong provider are refused without a fallback route', () => {
  for (const patch of [{ context: { kind: 'frontiers', status: 'unknown' } }, { quest: null },
    { seed: 'secret' }, { layout: {} }, { maze: {} }]) assert.throws(() => questPlan(request(patch), 1));
  assert.throws(() => questPlan({ ...request(), model: 'live-model' }, 1));
  assert.throws(() => discoveryPlan(request(), 1));
});
test('fixture proof bounds responses and refuses identical repeated intentions', () => {
  const call = questPlan(request(), 1);
  validateQuestSequence([], call);
  assert.throws(() => validateQuestSequence([call], call));
  assert.throws(() => validateQuestSequence(Array(12).fill(call), { ...call, tool: 'maze.observe' }));
});
