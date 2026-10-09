import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));

const corruptions = [
  ['latest-hidden-feature', 'historical projection differs from sources'],
  ['historical-projection', 'historical projection differs from sources'],
  ['source-content', 'historical projection differs from sources'],
  ['source-observer', 'observation scope mismatch'],
  ['source-sequence', 'observation sequence or identity mismatch'],
  ['archived-facts', 'archived context differs from historical sources'],
  ['archived-position', 'archived context differs from historical sources'],
  ['archived-evidence', 'archived context differs from historical sources'],
  ['archived-shape', 'archived context differs from historical sources'],
  ['blocked-key', 'blocked edge key mismatch'], ['blocked-evidence', 'invalid blocked edge evidence sequence'],
  ['blocked-address', 'invalid sequence or bound'], ['blocked-invented', 'historical projection differs from sources'],
  ['traversal-boolean', 'invalid traversal passability'], ['traversal-fields', 'unexpected fields'],
] as const;

for (const [variant, message] of corruptions) test(`${variant}: all consumers fail closed without mutation`, async ({ page }) => {
  const result = await page.evaluate(async variant => {
    const db = window.directedStorage; await db.setup();
    await db.captureDirectedContext('fixture', 'archived', 'human-view');
    const request = await db.request('fixture', 'blocked-look', { type: 'look' });
    await db.transaction(async tx => {
      const record = (await tx.objectStore('saves').get('fixture'))!;
      const { world, knowledge } = record.session;
      const first = (await tx.objectStore('observations').get(['fixture', 1]))!;
      const last = (await tx.objectStore('observations').get(['fixture', knowledge.revision]))!;
      const truth = world.features.T;
      const fabricated = { value: { id: truth.id, kind: truth.kind, name: truth.name,
        position: truth.position, state: truth.state }, observationId: last.id, observedAt: last.sequence };
      if (variant === 'latest-hidden-feature') {
        knowledge.features.T = fabricated;
        // Both redundant copies agree, with a real same-observer evidence ID.
        await tx.objectStore('saves').put(record, 'fixture');
        await tx.objectStore('projections').put(knowledge, ['fixture', knowledge.revision]);
      }
      if (variant === 'historical-projection') {
        const old = (await tx.objectStore('projections').get(['fixture', 1]))!;
        old.features.D.value.state = 'open';
        await tx.objectStore('projections').put(old, ['fixture', 1]);
      }
      if (variant.startsWith('blocked-')) {
        const from = { spaceId: 'H', row: 2, column: 2 }, to = { spaceId: 'H', row: 2, column: 1 };
        const key = `${JSON.stringify(['H', 2, 2])}>${JSON.stringify(['H', 2, 1])}`;
        knowledge.blockedEdges = { [variant === 'blocked-key' ? 'wrong-key' : key]: {
          value: { from, to }, observationId: last.id, observedAt: variant === 'blocked-evidence' ? 0 : last.sequence,
        } };
        if (variant === 'blocked-address') to.row = -1;
        await tx.objectStore('saves').put(record, 'fixture');
        await tx.objectStore('projections').put(knowledge, ['fixture', knowledge.revision]);
      }
      if (variant.startsWith('traversal-')) {
        const traversal = { from: first.scene.position, to: first.scene.position,
          passable: variant === 'traversal-boolean' ? 'false' : false, ...(variant === 'traversal-fields' ? { featureId: 'T' } : {}) };
        first.scene.traversal = traversal as unknown as NonNullable<typeof first.scene.traversal>;
        await tx.objectStore('observations').put(first, ['fixture', 1]);
      }
      if (variant.startsWith('source-')) {
        if (variant === 'source-content') first.scene.features.find(value => value.id === 'D')!.state = 'open';
        if (variant === 'source-observer') first.observerId = 'other-observer';
        if (variant === 'source-sequence') first.sequence = 2;
        await tx.objectStore('observations').put(first, ['fixture', 1]);
      }
      if (variant.startsWith('archived-')) {
        const archived = (await tx.objectStore('contexts').get(['fixture', 'archived']))!;
        const body = JSON.parse(archived.json);
        if (variant === 'archived-facts') body.features.push({ ...fabricated, status: 'current' });
        if (variant === 'archived-position') body.position = { spaceId: 'L', row: 2, column: 2 };
        if (variant === 'archived-evidence') archived.observationIds = [];
        if (variant === 'archived-shape') body.features = null;
        archived.json = JSON.stringify(body);
        archived.bytes = new TextEncoder().encode(archived.json).byteLength;
        await tx.objectStore('contexts').put(archived, ['fixture', 'archived']);
      }
    });
    const snapshot = () => db.transaction(async tx => {
      const result: Record<string, unknown> = {};
      for (const name of ['saves', 'worlds', 'observations', 'projections', 'events', 'contexts', 'receipts'] as const) {
        result[name] = { keys: await tx.objectStore(name).getAllKeys(), values: await tx.objectStore(name).getAll() };
      }
      return result;
    });
    const before = await snapshot(); const errors: string[] = [];
    for (const invoke of [() => db.readDirectedSave('fixture'), () => db.claimDirectedSave('fixture', 'owner-b'),
      () => db.captureDirectedContext('fixture', 'fresh', 'human-view'),
      () => db.captureDirectedContext('fixture', 'archived', 'human-view'),
      () => db.executeDirectedRequest('fixture', request, 100), () => db.auditDirectedSave('fixture'),
      () => db.createDirectedSave('fixture'), () => db.reconcileDirectedRequest('fixture', request)]) {
      try { await invoke(); errors.push('unexpected success'); } catch (caught) { errors.push(String(caught)); }
    }
    return { before, after: await snapshot(), errors };
  }, variant);
  expect(result.errors).toHaveLength(8);
  for (const error of result.errors) expect(error).toContain(message);
  expect(result.after).toEqual(result.before);
});

test('archived context stays exact after movement, interaction, takeover and reload', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const original = await db.captureDirectedContext('fixture', 'before', 'human-view');
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'navigate', { type: 'navigate', operationId: 'trip',
      target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } }), 100);
    for (let index = 0; index < 64; index++) {
      const current = (await db.readDirectedSave('fixture'))!;
      if (current.operation!.status !== 'running') break;
      await db.executeDirectedRequest('fixture', await db.request('fixture', `step-${index}`, {
        type: 'step', operationId: 'trip', sequence: current.operation!.nextStep,
      }), 101 + index);
    }
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'interact', { type: 'interact', featureId: 'V' }), 200);
    await db.claimDirectedSave('fixture', 'owner-b');
    return original;
  });
  await page.reload();
  const result = await page.evaluate(async () => {
    const db = window.directedStorage;
    const before = await db.auditDirectedSave('fixture');
    const replay = await db.captureDirectedContext('fixture', 'before', 'human-view');
    const after = await db.auditDirectedSave('fixture');
    return { before, replay, after };
  });
  expect(result.replay).toEqual(original); expect(result.replay.json).toBe(original.json);
  expect(result.after).toEqual(result.before);
  expect(result.after.contexts.find(value => value.id === 'before')).toEqual(original);
  expect(result.after.session.actor.position).not.toEqual(JSON.parse(original.json).position);
  expect(result.after.world!.features.V.state).toBe('active');
  expect(JSON.parse(original.json).features.find((entry: { value: { id: string } }) => entry.value.id === 'V').value.state).toBe('idle');
});

test('collision evidence survives normal look and validates archived blocked-edge context', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'navigate', { type: 'navigate', operationId: 'trip',
      target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } }), 100);
    await db.transaction(async tx => {
      const record = (await tx.objectStore('saves').get('fixture'))!;
      const world = record.session.world;
      world.features.secretGate = { id: 'secretGate', kind: 'door', name: 'Secret gate', hidden: true,
        state: 'closed', position: record.session.operation!.route[0] };
      world.revision++; record.session.revision++; record.counts.events++;
      await tx.objectStore('events').add({ id: 'fixture-gate', revision: world.revision,
        type: 'fixture-change', subjectId: 'secretGate' }, ['fixture', world.revision]);
      await tx.objectStore('worlds').put(world, 'fixture'); await tx.objectStore('saves').put(record, 'fixture');
    });
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'collision', { type: 'step', operationId: 'trip', sequence: 0 }), 101);
    const original = await db.captureDirectedContext('fixture', 'blocked', 'human-view');
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'look', { type: 'look' }), 102);
    const replay = await db.captureDirectedContext('fixture', 'blocked', 'human-view');
    return { original, replay, audit: await db.auditDirectedSave('fixture') };
  });
  expect(result.replay).toEqual(result.original);
  expect(Object.keys(result.audit.session.knowledge.blockedEdges!)).toHaveLength(1);
  expect(JSON.parse(result.original.json).blockedEdges).toHaveLength(1);
  expect(result.original.json).not.toContain('secretGate');
  expect(result.audit.observations.filter(value => value.scene.traversal?.passable === false)).toHaveLength(1);
});

test('pre-addition empty blocked-edge contexts replay original bytes without rewriting', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const original = await db.captureDirectedContext('fixture', 'legacy', 'human-view');
    const { blockedEdges: _empty, ...body } = JSON.parse(original.json);
    original.json = JSON.stringify(body); original.bytes = new TextEncoder().encode(original.json).byteLength;
    await db.transaction(async tx => { await tx.objectStore('contexts').put(original, ['fixture', 'legacy']); });
    const replay = await db.captureDirectedContext('fixture', 'legacy', 'human-view');
    return { original, replay, audit: await db.auditDirectedSave('fixture') };
  });
  expect(result.replay).toEqual(result.original);
  expect(result.audit.contexts[0]).toEqual(result.original);
  expect(Object.hasOwn(JSON.parse(result.replay.json), 'blockedEdges')).toBe(false);
});
