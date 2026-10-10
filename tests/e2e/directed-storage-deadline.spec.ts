import { expect, test, type Page } from '@playwright/test';
import { openFixture } from './directed-storage-support';

async function prepare(page: Page, historyMode: 'checkpoint-v1' | 'legacy-full-audit', finalStep = false) {
  return page.evaluate(async ({ historyMode, finalStep }) => {
    const db = window.directedStorage;
    await db.createDirectedSave('deadline', { historyMode });
    await db.claimDirectedSave('deadline', 'owner-a');
    await db.executeDirectedRequest('deadline', await db.request('deadline', 'navigate', {
      type: 'navigate', operationId: 'trip', target: finalStep
        ? { kind: 'cell', address: { spaceId: 'H', row: 2, column: 1 }, arrival: 'occupy' }
        : { kind: 'feature', featureId: 'V', arrival: 'adjacent' },
    }), () => 1000);
    const before = await db.auditDirectedSave('deadline');
    const request = await db.request('deadline', 'step', { type: 'step', operationId: 'trip', sequence: 0 });
    return { before, request, deadline: before.session.operation!.deadline };
  }, { historyMode, finalStep });
}

test.beforeEach(async ({ page }) => openFixture(page));

for (const historyMode of ['checkpoint-v1', 'legacy-full-audit'] as const) {
  for (const useDefaultClock of [false, true]) for (const offset of [0, 1]) {
    test(`${historyMode}: native lock admits ${useDefaultClock ? 'wall' : 'injected'} clock at deadline + ${offset}`, async ({ page }) => {
      const prepared = await prepare(page, historyMode);
      const result = await page.evaluate(async ({ request, deadline, offset, useDefaultClock }) => {
        const db = window.directedStorage;
        const execution = await db.executeBehindDirectedLock('deadline', request, deadline - 1, deadline + offset, useDefaultClock);
        return { ...execution, after: await db.auditDirectedSave('deadline') };
      }, { ...prepared, offset, useDefaultClock });
      expect(result.queued).toBe(true);
      expect(result.samplesBeforeRelease).toBe(0);
      expect(result.samples).toBe(1);
      expect(result.receipt.result.status).toBe('applied');
      expect(result.receipt.result.operation).toMatchObject({ status: 'interrupted', steps: 0, nextStep: 1,
        startedAt: 1000, deadline: prepared.deadline, reason: 'Travel time budget exhausted.' });
      expect(result.receipt.observationIds).toEqual([]);
      expect(result.receipt.eventIds).toEqual([]);
      expect(result.after.session.actor).toEqual(prepared.before.session.actor);
      expect(result.after.session.knowledge).toEqual(prepared.before.session.knowledge);
      for (const journal of ['world', 'observations', 'projections', 'events', 'contexts'] as const) {
        expect(result.after[journal]).toEqual(prepared.before[journal]);
      }
      expect(result.after.receipts).toEqual([...prepared.before.receipts, result.receipt]);
    });
  }

  for (const finalStep of [false, true]) for (const offset of [0, 1]) {
    test(`${historyMode}: ${finalStep ? 'arrival' : 'running'} step rolls back at final write deadline + ${offset}`, async ({ page }) => {
      const prepared = await prepare(page, historyMode, finalStep);
      const result = await page.evaluate(async ({ request, deadline, offset }) => {
        const db = window.directedStorage, before = await db.rawDirectedDatabase();
        const completed = new Set<string>();
        const add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
        for (const method of ['add', 'put'] as const) {
          const original = method === 'add' ? add : put;
          IDBObjectStore.prototype[method] = function(value, key) {
            const write = original.call(this, value, key);
            write.addEventListener('success', () => completed.add(this.name));
            return write;
          };
        }
        let calls = 0, error = '', atFinalCheck: string[] = [];
        try {
          await db.executeDirectedRequest('deadline', request, () => {
            if (++calls === 1) return deadline - 1;
            atFinalCheck = [...completed];
            return deadline + offset;
          });
        } catch (cause) { error = String(cause); }
        finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
        const rollback = await db.rawDirectedDatabase();
        const absent = await db.reconcileDirectedRequest('deadline', request);
        // Recovery retains the exact attempt. No second physical effect may be attempted.
        const stopped = await db.executeDirectedRequest('deadline', request, () => deadline + offset);
        const recovered = await db.auditDirectedSave('deadline');
        await db.claimDirectedSave('deadline', 'owner-b');
        const atTakeover = await db.rawDirectedDatabase();
        const replay = await db.executeDirectedRequest('deadline', request, () => { throw new Error('Replay read the clock'); });
        return { before, rollback, absent, error, calls, atFinalCheck, stopped, recovered, replay,
          atTakeover, afterReplay: await db.rawDirectedDatabase() };
      }, { ...prepared, offset });
      expect(result.error).toContain('directed deadline expired before commit');
      expect(result.calls).toBe(2);
      expect(result.atFinalCheck).toEqual(expect.arrayContaining(['saves', 'worlds', 'receipts', 'events', 'observations', 'projections']));
      if (historyMode === 'checkpoint-v1') expect(result.atFinalCheck).toContain('witnesses');
      expect(result.rollback).toEqual(result.before);
      expect(result.absent).toBeUndefined();
      expect(result.stopped.result.operation).toMatchObject({ status: 'interrupted', steps: 0, nextStep: 1,
        startedAt: 1000, deadline: prepared.deadline });
      expect(result.stopped.observationIds).toEqual([]);
      expect(result.stopped.eventIds).toEqual([]);
      expect(result.recovered.session.actor).toEqual(prepared.before.session.actor);
      expect(result.recovered.session.knowledge).toEqual(prepared.before.session.knowledge);
      for (const journal of ['world', 'observations', 'projections', 'events', 'contexts'] as const) {
        expect(result.recovered[journal]).toEqual(prepared.before[journal]);
      }
      expect(result.replay).toEqual(result.stopped);
      expect(result.afterReplay).toEqual(result.atTakeover);
    });
  }

  test(`${historyMode}: pre-deadline arrival replays exactly after reload, expiry and takeover`, async ({ page }) => {
    const prepared = await prepare(page, historyMode, true);
    const receipt = await page.evaluate(async ({ request, deadline }) => {
      const db = window.directedStorage;
      const receipt = await db.executeDirectedRequest('deadline', request, () => deadline - 1);
      await db.claimDirectedSave('deadline', 'owner-b');
      return receipt;
    }, prepared);
    expect(receipt.result.operation).toMatchObject({ status: 'arrived', steps: 1, deadline: prepared.deadline });
    expect(receipt.eventIds).toHaveLength(1);
    await page.reload();
    const result = await page.evaluate(async ({ request, deadline }) => {
      const db = window.directedStorage, before = await db.rawDirectedDatabase();
      const expiredReplay = await db.executeDirectedRequest('deadline', request, () => deadline + 1);
      const replay = await db.executeDirectedRequest('deadline', request, () => { throw new Error('Replay read the clock'); });
      const reconciled = await db.reconcileDirectedRequest('deadline', request);
      const stale = await db.executeDirectedRequest('deadline', { ...request, attemptId: 'stale-new-attempt' },
        () => { throw new Error('Stale request read the clock'); });
      let conflict = '';
      try { await db.executeDirectedRequest('deadline', { ...request, expectedRevision: request.expectedRevision + 1 },
        () => { throw new Error('Conflict read the clock'); }); }
      catch (cause) { conflict = String(cause); }
      return { before, expiredReplay, replay, reconciled, stale, conflict, after: await db.rawDirectedDatabase() };
    }, prepared);
    expect(result.expiredReplay).toEqual(receipt);
    expect(result.replay).toEqual(receipt);
    expect(result.reconciled).toEqual(receipt);
    expect(result.stale.result).toMatchObject({ status: 'refused', reason: 'stale-owner' });
    expect(result.conflict).toContain('attempt ID payload conflict');
    expect(result.after).toEqual(result.before);
  });
}
