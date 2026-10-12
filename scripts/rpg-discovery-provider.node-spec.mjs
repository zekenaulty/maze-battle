import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoveryPlan, validateDiscoverySequence } from './rpg-discovery-provider.mjs';
import { rpgPlan } from './rpg-paired-provider.mjs';

const scope = '00000000-0000-4000-8000-000000000000';
const objective = 'Explore from earned observations. Query current frontiers, choose a bounded frontier approach, review newly revealed evidence and choose the next intention. Do not interact or collect. Arrival does not complete exploration.';
function request(context, override = {}) {
  const frame = { kind: context ? 'operation' : 'local', scopeId: scope, perspectiveId: 'party', gameId: 'game', floor: 1,
    actor: { floor: 1, row: 6, column: 0 }, sourceHead: { id: 'receipt', gameId: 'game' },
    ...(context ? { context } : { cells: [{ address: { floor: 1, row: 6, column: 0 } }] }), ...override };
  const payload = { identity: { HostId: 'maze-battle', PerspectiveId: 'party', ScopeId: scope, SessionEpoch: '1' },
    currentObservation: { Reference: { Revision: 1, ObservationId: 'observation' }, Data: frame } };
  return { model: 'fixture-model', stream: true, store: false, input: [{ role: 'user', content:
    `Objective:\n${objective}\nOrigin:\nfixture\nProjected context frames:\n${JSON.stringify([{ payload }])}\nCurrent planning constraints:\n{}${context ? '\n"refinedPlan"' : ''}` }] };
}
function page(direction = 'east') {
  return { kind: 'frontiers', status: 'ready', floor: 1, snapshotId: 'receipt', frontiers: [
    { anchor: { floor: 1, row: 6, column: 2 }, direction, source: { id: 'receipt' } },
  ] };
}

test('query is independent of hidden fixture layout; choice uses only the returned ordered frontier', () => {
  const query = discoveryPlan(request(), 1);
  assert.equal(query.tool, 'maze.frontiers'); assert.deepEqual(query.input, { limit: 12 });
  for (const direction of ['east', 'north']) {
    const action = discoveryPlan(request(page(direction)), 2);
    assert.deepEqual(action.input, { row: 6, column: 2, direction, sourceId: 'receipt' });
    assert.equal(JSON.parse(action.text).refinedPlan.steps[0].toolId, 'maze.explore');
    validateDiscoverySequence([query], action);
  }
});

test('no synthetic fallback for unknown, stale, empty, actor-only or excessive context', () => {
  for (const change of [
    p => { p.snapshotId = 'old'; }, p => { p.floor = 2; }, p => { p.frontiers = []; },
    p => { p.frontiers[0].source.id = 'old'; }, p => { p.frontiers[0].anchor.column = 0; },
    p => { p.frontiers[0].direction = 'up'; }, p => { p.kind = 'map'; },
    p => { p.frontiers = Array(13).fill(p.frontiers[0]); },
  ]) {
    const p = page(); change(p); assert.throws(() => discoveryPlan(request(p), 1));
  }
  for (const field of ['seed', 'recipe', 'layout', 'floors', 'maze', 'checkpoint', 'knowledge'])
    assert.throws(() => discoveryPlan(request(undefined, { [field]: 'hidden' }), 1));
  assert.throws(() => discoveryPlan({ ...request(), model: 'paid-model' }, 1));
  assert.throws(() => discoveryPlan({ ...request(), store: true }, 1));
});

test('successor requires new evidence at selected anchor, with coordinate key order immaterial', () => {
  const query = discoveryPlan(request(), 1), action = discoveryPlan(request(page()), 2), prior = [query, action];
  const successor = { ...query, actor: { column: 2, row: 6, floor: 1 }, observationRevision: 3 };
  validateDiscoverySequence(prior, successor);
  assert.throws(() => validateDiscoverySequence(prior, query));
  assert.throws(() => validateDiscoverySequence(prior, { ...successor, observationRevision: 1 }));
  assert.throws(() => validateDiscoverySequence(prior, { ...successor, actor: { floor: 1, row: 6, column: 3 } }));
  assert.throws(() => validateDiscoverySequence([...prior, successor, action], successor));
});

test('known-destination parser still refuses exploration/context and preserves owner target', () => {
  assert.throws(() => rpgPlan(request(), 1));
  const body = request(); body.input[0].content = body.input[0].content.replace(objective,
    'Reach the known destination at floor 1, row 6, column 5. Do not interact or collect.');
  assert.deepEqual(rpgPlan(body, 1).input, { row: 6, column: 5 });
  const withContext = request(page()); withContext.input[0].content = withContext.input[0].content.replace(objective,
    'Reach the known destination at floor 1, row 6, column 5. Do not interact or collect.');
  assert.throws(() => rpgPlan(withContext, 1));
});
