import { test, expect, attachEvidence } from './canonical-frontier-exploration.test';
import type { CanonicalRecord } from '../../src/persistence/canonical/types';

test('newly visible adjoining space stops exploration without crossing or claiming room completion', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontierExploration, seeded = await c.seed('A', 'scope-boundary'), effects = await c.effects();
    const admission = await c.admit(seeded.page.value[0]), rows = await c.capture(admission.id, 2);
    return { seeded, admission, rows, effects, afterEffects: await c.effects() };
  });
  await attachEvidence(info, 'other-space-visible.json', result);
  expect(result.rows).toHaveLength(2);
  const last = result.rows[1], progress = last.state.value.progress, notice = progress.notice!;
  expect(progress).toMatchObject({ steps: 1, status: 'decision', reason: 'scope-boundary', route: [] });
  expect(progress.position.cell.spaceId).toBe(result.seeded.sight.header.actor.cell.spaceId);
  expect(notice).toMatchObject({ kind: 'other-space-visible', previousSource: null });
  expect(notice.at.cell.spaceId).not.toBe(progress.position.cell.spaceId);
  const source = last.state.head.checkpoint.knowledge as { sequence: number; id: string };
  expect(notice.source).toEqual({ sequence: source.sequence, id: source.id, index: notice.source.index });
  expect(last.frame.sight.cells[notice.source.index].at).toEqual(notice.at);
  expect(result.seeded.sight.cells.every(cell => cell.at.cell.spaceId === progress.position.cell.spaceId)).toBe(true);
  expect(last.frame.sight.cells.some(cell => cell.chests.length || cell.stairs.length)).toBe(false);
  expect(last.state.head.roots.world).toEqual(result.seeded.page.head.roots.world);
  expect(result.afterEffects).toEqual(result.effects);
});

for (const phase of ['observation', 'navigation', 'head'] as const) {
  test(`${phase} write failure atomically rolls back the material-disclosure move; exact retry commits once`, async ({ page }, info) => {
    const result = await page.evaluate(async phase => {
      const c = window.canonicalFrontierExploration, seeded = await c.seed('A'), admission = await c.admit(seeded.page.value[0]);
      await c.capture(admission.id, 2);
      const original = await c.readDestination(admission.id), frame = await c.frame(), effects = await c.effects();
      const request = c.command(original.head, 'navigation.advance', { operationId: admission.id, sequence: original.value.progress.sequence });
      const observation = c.observationKey(frame.sight.header.sequence + 1), navigation = c.destinationKey(admission.id);
      const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      const reached = { observation: false, navigation: false, receipt: false };
      let injections = 0;
      function inspect(store: string, value: unknown) {
        const row = value as CanonicalRecord;
        const isObservation = store === 'records' && row.area === 'knowledge' && row.key === observation;
        const isNavigation = store === 'records' && row.area === 'execution' && row.key === navigation;
        reached.observation ||= isObservation; reached.navigation ||= isNavigation;
        reached.receipt ||= store === 'receipts';
        if (phase === 'observation' && isObservation || phase === 'navigation' && isNavigation || phase === 'head' && store === 'heads') {
          injections++; throw new DOMException(`Injected material ${phase} failure`, 'QuotaExceededError');
        }
      }
      IDBObjectStore.prototype.add = function(...args) { inspect(this.name, args[0]); return add.apply(this, args); };
      IDBObjectStore.prototype.put = function(...args) { inspect(this.name, args[0]); return put.apply(this, args); };
      let failure;
      try { failure = await c.refusal(() => c.executeNavigationCommand(request)); }
      finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
      const after = await c.dump(), rolledBack = await c.readDestination(admission.id), afterFrame = await c.frame();
      const retry = await c.executeNavigationCommand(request), committed = await c.readDestination(admission.id), committedFrame = await c.frame();
      const afterRetry = await c.dump(), replay = await c.executeNavigationCommand(request), afterReplay = await c.dump();
      return { phase, injections, reached, failure, request, original, frame, effects, before, after, rolledBack, afterFrame,
        retry, committed, committedFrame, afterRetry, replay, afterReplay, afterEffects: await c.effects() };
    }, phase);
    await attachEvidence(info, `material-${phase}-rollback.json`, result);
    expect(result.original.value.progress).toMatchObject({ steps: 2, status: 'running', reason: null });
    expect(result.frame.sight.cells.every(cell => !cell.chests.length)).toBe(true);
    expect(result.injections).toBe(1); expect(result.failure!.rejected).toBe(true);
    expect(result.failure!.message).toContain('QuotaExceededError');
    expect(result.reached.observation).toBe(true);
    if (phase !== 'observation') expect(result.reached.navigation).toBe(true);
    if (phase === 'head') expect(result.reached.receipt).toBe(true);
    expect(result.after).toBe(result.before); expect(result.rolledBack.value).toEqual(result.original.value);
    expect(result.rolledBack.head).toEqual(result.original.head); expect(result.afterFrame).toEqual(result.frame);
    expect(result.retry.replayed).toBe(false);
    expect(result.committed.head.revision).toBe(result.original.head.revision + 1);
    expect(result.committed.value.progress).toMatchObject({ steps: 3, sequence: result.original.value.progress.sequence + 1,
      status: 'decision', reason: 'new-object', binding: result.original.value.progress.binding, exploration: result.original.value.progress.exploration });
    const source = result.committed.head.checkpoint.knowledge as { sequence: number; id: string };
    const index = result.committedFrame.sight.cells.findIndex(cell => cell.chests.some(chest => !chest.opened));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(source.sequence).toBe(result.frame.sight.header.sequence + 1);
    expect(result.committed.value.progress.notice).toEqual({ kind: 'unopened-chest', at: result.committedFrame.sight.cells[index].at,
      previousSource: null, source: { sequence: source.sequence, id: source.id, index } });
    expect(result.committed.head.quota.reservations).toBe(1);
    expect(result.committed.head.roots.world).toEqual(result.original.head.roots.world); expect(result.afterEffects).toEqual(result.effects);
    expect(result.replay.replayed).toBe(true); expect(result.replay.stats.writes).toBe(0);
    expect(result.replay.receipt).toEqual(result.retry.receipt); expect(result.afterReplay).toBe(result.afterRetry);
  });
}
