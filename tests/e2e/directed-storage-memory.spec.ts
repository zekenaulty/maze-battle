import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));

for (const historyMode of ['checkpoint-v1', 'legacy-full-audit'] as const) {
  test(`${historyMode}: scoped overview and distant recall preserve exact historical bytes without observing`, async ({ page }) => {
    const first = await page.evaluate(async historyMode => {
      const db = window.directedStorage;
      await db.createDirectedSave('memory', { historyMode });
      await db.claimDirectedSave('memory', 'owner');
      const before = await db.readDirectedSave('memory');
      const overview = await db.captureDirectedMemoryContext('memory', 'overview', 'human-view', { kind: 'overview' });
      const recall = await db.captureDirectedMemoryContext('memory', 'recall', 'decision-fixture', {
        kind: 'destination', target: { kind: 'feature', featureId: 'V' },
      });
      const human = await db.captureDirectedMemoryContext('memory', 'human-recall', 'human-view', {
        kind: 'destination', target: { kind: 'feature', featureId: 'V' },
      });
      const after = await db.readDirectedSave('memory');
      const result = { before, after, overview, recall, human };
      await db.executeDirectedRequest('memory', await db.request('memory', 'travel', {
        type: 'navigate', operationId: 'trip', target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' },
      }), 100);
      for (let step = 0; step < 64; step++) {
        const current = (await db.readDirectedSave('memory'))!;
        if (current.operation?.status !== 'running') break;
        await db.executeDirectedRequest('memory', await db.request('memory', `step-${step}`, {
          type: 'step', operationId: 'trip', sequence: current.operation.nextStep,
        }), 101 + step);
      }
      await db.executeDirectedRequest('memory', await db.request('memory', 'lever', { type: 'interact', featureId: 'V' }), 200);
      return result;
    }, historyMode);
    expect(first.after).toEqual(first.before);
    const overview = JSON.parse(first.overview.json), recall = JSON.parse(first.recall.json);
    expect(overview.currentRoom.roomId).toBe('H');
    expect(overview.distant.some((room: { roomId: string }) => room.roomId === 'L')).toBe(true);
    expect(overview.currentRoom.cells.every((cell: { value: { address: { spaceId: string } } }) => cell.value.address.spaceId === 'H')).toBe(true);
    expect(recall.feature.value.id).toBe('V'); expect(recall.feature.value.state).toBe('idle');
    expect(recall.feature.evidence.status).toBe('stale');
    expect(recall.route).toMatchObject({ status: 'known-route', firstRouteDirection: 'west' });
    expect(recall.cells).toBeUndefined(); expect(first.recall.json).toBe(first.human.json);
    expect(first.overview.bytes).toBeLessThanOrEqual(16384);
    await page.reload();
    const restored = await page.evaluate(async () => {
      const db = window.directedStorage;
      const archived = await db.captureDirectedMemoryContext('memory', 'recall', 'decision-fixture', {
        kind: 'destination', target: { kind: 'feature', featureId: 'V' },
      });
      const fresh = await db.captureDirectedMemoryContext('memory', 'current-recall', 'decision-fixture', {
        kind: 'destination', target: { kind: 'feature', featureId: 'V' },
      });
      return { archived, fresh, audit: await db.auditDirectedSave('memory') };
    });
    expect(restored.archived).toEqual(first.recall);
    expect(JSON.parse(restored.fresh.json).feature.value.state).toBe('active');
    expect(restored.audit.contexts.find(context => context.id === 'recall')).toEqual(first.recall);
  });
}

test('memory context IDs bind selection and bounds; unknown recall does not disclose hidden truth', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage;
    await db.createDirectedSave('memory', { historyMode: 'checkpoint-v1' });
    const original = await db.captureDirectedMemoryContext('memory', 'fixed', 'decision-fixture', { kind: 'overview' });
    const errors: string[] = [];
    for (const selection of [{ kind: 'overview' as const, bounds: { cells: 2 } },
      { kind: 'destination' as const, target: { kind: 'room' as const, roomId: 'L' } }]) {
      try { await db.captureDirectedMemoryContext('memory', 'fixed', 'decision-fixture', selection); errors.push('unexpected success'); }
      catch (error) { errors.push(String(error)); }
    }
    const hidden = await db.captureDirectedMemoryContext('memory', 'hidden-query', 'decision-fixture', {
      kind: 'destination', target: { kind: 'feature', featureId: 'T' },
    });
    return { original, replay: await db.captureDirectedMemoryContext('memory', 'fixed', 'decision-fixture', { kind: 'overview' }), hidden, errors };
  });
  expect(result.replay).toEqual(result.original);
  expect(result.errors.every(error => error.includes('context ID payload conflict'))).toBe(true);
  const hidden = JSON.parse(result.hidden.json);
  expect(hidden.status).toBe('unknown'); expect(hidden.feature).toBeUndefined();
  expect(result.hidden.json).not.toMatch(/Hidden Trap|pressure-sensitive|sourceWorldRevision/);
});
