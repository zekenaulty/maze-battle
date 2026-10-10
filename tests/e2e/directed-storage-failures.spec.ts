import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));

test('receipt add failure rolls back state, observations, projections, and world events', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const navigation = await db.executeDirectedRequest('fixture', await db.request('fixture', 'nav', {
      type: 'navigate', operationId: 'op', target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' },
    }), 100);
    const request = await db.request('fixture', 'step', { type: 'step', operationId: 'op', sequence: navigation.result.operation!.nextStep });
    const before = await db.auditDirectedSave('fixture');
    const add = IDBObjectStore.prototype.add;
    let error = ''; let receiptAdds = 0;
    IDBObjectStore.prototype.add = function(value, key) {
      if (this.name === 'receipts') { receiptAdds++; throw new DOMException('Injected quota failure', 'QuotaExceededError'); }
      return add.call(this, value, key);
    };
    try { await db.executeDirectedRequest('fixture', request, 101); } catch (caught) { error = String(caught); }
    finally { IDBObjectStore.prototype.add = add; }
    const after = await db.auditDirectedSave('fixture');
    const missing = await db.reconcileDirectedRequest('fixture', request);
    const retry = await db.executeDirectedRequest('fixture', request, 101);
    return { before, after, missing, retry, error, receiptAdds };
  });
  expect(result.receiptAdds).toBe(1); expect(result.error).toContain('quota failure');
  expect(result.after).toEqual(result.before); expect(result.missing).toBeUndefined(); expect(result.retry.result.status).toBe('applied');
});

test('4096 receipt journal limit fails before any durable effect and preserves exact replay', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const request = await db.request('fixture', 'original', { type: 'look' });
    const receipt = await db.executeDirectedRequest('fixture', request, 100);
    await db.transaction(async tx => {
      for (let index = 1; index < 4096; index++) {
        const item = structuredClone(receipt); item.request.attemptId = `seed-${index}`;
        await tx.objectStore('receipts').add(item, ['fixture', item.request.attemptId]);
      }
      const record = (await tx.objectStore('saves').get('fixture'))!;
      record.counts.receipts = 4096; await tx.objectStore('saves').put(record, 'fixture');
    });
    const before = await db.readDirectedSave('fixture');
    const fresh = await db.request('fixture', 'overflow', { type: 'look' });
    let error = '';
    try { await db.executeDirectedRequest('fixture', fresh, 101); } catch (caught) { error = String(caught); }
    return { error, before, after: await db.readDirectedSave('fixture'), missing: await db.reconcileDirectedRequest('fixture', fresh),
      replay: await db.executeDirectedRequest('fixture', request, 102), receipt };
  });
  expect(result.error).toContain('receipts journal full'); expect(result.before).toEqual(result.after);
  expect(result.missing).toBeUndefined(); expect(result.replay).toEqual(result.receipt);
});

test('corrupt saves are rejected, never reset or replaced by create', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const db = window.directedStorage;
    const results: string[] = [];
    for (const variant of ['version', 'scope', 'sequence', 'null', 'undefined']) {
      await db.setup(variant);
      await db.transaction(async tx => {
        const record = (await tx.objectStore('saves').get(variant))!;
        if (variant === 'version') (record.session as { version: string }).version = 'future-version';
        if (variant === 'scope') record.session.knowledge.observerId = 'wrong-observer';
        if (variant === 'sequence') record.session.knowledge.revision++;
        const corrupt = variant === 'null' ? null : variant === 'undefined' ? undefined : record;
        await tx.objectStore('saves').put(corrupt as unknown as typeof record, variant);
      });
      try { await db.createDirectedSave(variant); results.push('unexpected success'); } catch (caught) { results.push(String(caught)); }
    }
    return results;
  });
  expect(errors).toHaveLength(5); expect(errors.every(value => value.startsWith('Error: Directed storage:'))).toBe(true);
});

test('historical projection corruption is rejected by independent audit', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    await db.transaction(async tx => {
      const old = (await tx.objectStore('projections').get(['fixture', 1]))!;
      old.observerId = 'other-observer'; await tx.objectStore('projections').put(old, ['fixture', 1]);
    });
    try { await db.auditDirectedSave('fixture'); return 'unexpected success'; } catch (caught) { return String(caught); }
  });
  expect(result).toContain('historical projection differs from sources');
});

const corruptions = [
  ['world-cell-key', 'cell key mismatch'], ['world-space-key', 'space key mismatch'],
  ['world-feature-key', 'feature key mismatch'], ['cell-space', 'world position references missing space'],
  ['cell-bounds', 'world position outside space dimensions'], ['exit-cell', 'world position references missing cell'],
  ['exit-direction', 'exit direction coordinate mismatch'], ['feature-position', 'world position outside space dimensions'],
  ['actor-space', 'world position references missing space'], ['actor-cell', 'world position references missing cell'],
  ['save-version', 'unsupported save version'], ['knowledge-cell-key', 'remembered cell key mismatch'],
  ['knowledge-space-key', 'remembered identity key mismatch'], ['knowledge-feature-key', 'remembered identity key mismatch'],
  ['evidence-zero', 'invalid projection evidence sequence'], ['evidence-future', 'invalid projection evidence sequence'],
  ['absence-zero', 'invalid absence evidence sequence'], ['absence-future', 'invalid absence evidence sequence'],
] as const;

for (const [variant, message] of corruptions) test(`${variant}: read, claim, execute reject without mutation`, async ({ page }) => {
  const result = await page.evaluate(async variant => {
    const db = window.directedStorage; await db.setup();
    const request = await db.request('fixture', 'corrupt-attempt', { type: 'look' });
    await db.transaction(async tx => {
      const record = (await tx.objectStore('saves').get('fixture'))!;
      const { world, knowledge, actor } = record.session;
      const rekey = <T>(map: Record<string, T>) => Object.fromEntries(Object.entries(map)
        .map(([key, value], index) => [index === 0 ? 'mismatched-key' : key, value]));
      const cellKey = JSON.stringify(['H', 2, 2]);
      if (variant === 'world-cell-key') world.cells = rekey(world.cells);
      if (variant === 'world-space-key') world.spaces = rekey(world.spaces);
      if (variant === 'world-feature-key') world.features = rekey(world.features);
      if (variant === 'cell-space') world.cells[JSON.stringify(['missing-space', 0, 0])] = {
        address: { spaceId: 'missing-space', row: 0, column: 0 }, exits: {},
      };
      if (variant === 'cell-bounds') world.spaces.H.rows = 4;
      if (variant === 'exit-direction') world.cells[cellKey].exits.east = { spaceId: 'H', row: 2, column: 1 };
      if (variant === 'feature-position') world.features.V.position.row = 5;
      if (variant === 'actor-space') actor.position.spaceId = 'missing-space';
      if (variant === 'actor-cell' || variant === 'exit-cell') {
        world.spaces.Q = { id: 'Q', name: 'Empty space', originX: 13, originZ: 2, rows: 1, columns: 1 };
        const missing = { spaceId: 'Q', row: 0, column: 0 };
        if (variant === 'actor-cell') actor.position = missing;
        else world.cells[JSON.stringify(['H', 2, 4])].exits.east = missing;
      }
      if (variant === 'save-version') (record.session as { version: string }).version = 'directed-v2';
      if (variant === 'knowledge-cell-key') knowledge.cells = rekey(knowledge.cells);
      if (variant === 'knowledge-space-key') knowledge.spaces = rekey(knowledge.spaces);
      if (variant === 'knowledge-feature-key') knowledge.features = rekey(knowledge.features);
      if (variant === 'evidence-zero' || variant === 'evidence-future') {
        Object.values(knowledge.cells)[0].observedAt = variant === 'evidence-zero' ? 0 : knowledge.revision + 1;
      }
      if (variant === 'absence-zero' || variant === 'absence-future') knowledge.absent.removed = {
        observationId: Object.values(knowledge.cells)[0].observationId,
        observedAt: variant === 'absence-zero' ? 0 : knowledge.revision + 1,
      };
      // Keep duplicated checkpoints in agreement so shape validation is the rejection.
      await tx.objectStore('saves').put(record, 'fixture');
      await tx.objectStore('worlds').put(world, 'fixture');
      await tx.objectStore('projections').put(knowledge, ['fixture', knowledge.revision]);
    });
    const snapshot = () => db.transaction(async tx => ({
      save: await tx.objectStore('saves').get('fixture'), world: await tx.objectStore('worlds').get('fixture'),
      projections: await tx.objectStore('projections').getAll(), observations: await tx.objectStore('observations').getAll(),
      events: await tx.objectStore('events').getAll(), contexts: await tx.objectStore('contexts').getAll(),
      receipts: await tx.objectStore('receipts').getAll(),
    }));
    const before = await snapshot(); const errors: string[] = [];
    for (const invoke of [() => db.readDirectedSave('fixture'), () => db.claimDirectedSave('fixture', 'owner-b'),
      () => db.executeDirectedRequest('fixture', request, 100)]) {
      try { await invoke(); errors.push('unexpected success'); } catch (caught) { errors.push(String(caught)); }
    }
    return { before, after: await snapshot(), errors };
  }, variant);
  expect(result.errors).toHaveLength(3);
  for (const error of result.errors) expect(error).toContain(message);
  expect(result.after).toEqual(result.before);
});

test('stale remembered traversal and feature states remain usable without consulting live truth', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const before = (await db.readDirectedSave('fixture'))!;
    const key = JSON.stringify(['L', 2, 2]);
    await db.transaction(async tx => {
      const record = (await tx.objectStore('saves').get('fixture'))!;
      const world = record.session.world;
      world.features.V.state = 'active';
      world.cells[key].exits = Object.fromEntries(Object.entries(world.cells[key].exits).filter(([direction]) => direction !== 'east'));
      world.revision++; record.session.revision++; record.counts.events++;
      await tx.objectStore('events').add({ id: 'fixture-remote-change', revision: world.revision,
        type: 'fixture-change', subjectId: 'V', before: 'idle', after: 'active' }, ['fixture', world.revision]);
      await tx.objectStore('worlds').put(world, 'fixture'); await tx.objectStore('saves').put(record, 'fixture');
    });
    const read = (await db.readDirectedSave('fixture'))!;
    const claimed = await db.claimDirectedSave('fixture', 'owner-b');
    const receipt = await db.executeDirectedRequest('fixture', await db.request('fixture', 'local-look', { type: 'look' }), 100);
    const after = (await db.readDirectedSave('fixture'))!;
    const frontier = Object.values(before.knowledge.cells).flatMap(item => Object.values(item.value.exits))
      .filter(position => !Object.hasOwn(before.knowledge.cells, JSON.stringify([position.spaceId, position.row, position.column]))).length;
    return { before, read, claimed, receipt, after, key, frontier };
  });
  expect(result.read.knowledge).toEqual(result.before.knowledge); expect(result.claimed.knowledge).toEqual(result.before.knowledge);
  expect(result.receipt.result.status).toBe('applied'); expect(result.frontier).toBeGreaterThan(0);
  expect(result.after.world.features.V.state).toBe('active'); expect(result.after.world.cells[result.key].exits.east).toBeUndefined();
  expect(result.after.knowledge.features.V).toEqual(result.before.knowledge.features.V);
  expect(result.after.knowledge.cells[result.key]).toEqual(result.before.knowledge.cells[result.key]);
});
