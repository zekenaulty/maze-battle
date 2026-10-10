import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';
import { writeFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await openFixture(page);
  await page.evaluate(async () => {
    await window.directedStorage.createDirectedSave('history', { historyMode: 'checkpoint-v1' });
    await window.directedStorage.claimDirectedSave('history', 'owner');
  });
});

test('checkpoint loads are bounded while exact paged evidence and full replay are retained', async ({ page }, info) => {
  test.setTimeout(180000);
  const result = await page.evaluate(async () => {
    const db = window.directedStorage;
    const original = await db.captureDirectedContext('history', 'original', 'human-view');
    const samples: { entries: number; reads: number; milliseconds: number; pageBytes: number; retainedBytes: number }[] = [];
    let current = (await db.readDirectedSave('history'))!;
    for (const size of [32, 128, 512]) {
      while (current.knowledge.revision < size) {
        const response = await db.executeDirectedRequest('history', { attemptId: `grow-${current.knowledge.revision}`,
          owner: current.owner!, epoch: current.epoch, expectedRevision: current.revision, command: { type: 'look' } }, 100);
        current = (await db.readDirectedSave('history'))!;
        if (response.result.status !== 'applied') throw new Error(response.result.reason);
      }
      let reads = 0;
      const proto = IDBObjectStore.prototype, get = proto.get, getAll = proto.getAll, count = proto.count, cursor = proto.openCursor;
      proto.get = function(...args) { reads++; return get.apply(this, args); };
      proto.getAll = function(...args) { reads++; return getAll.apply(this, args); };
      proto.count = function(...args) { reads++; return count.apply(this, args); };
      proto.openCursor = function(...args) { reads++; return cursor.apply(this, args); };
      const start = performance.now();
      try { await db.readDirectedSave('history'); }
      finally { proto.get = get; proto.getAll = getAll; proto.count = count; proto.openCursor = cursor; }
      const milliseconds = performance.now() - start;
      const page = await db.readDirectedHistoryPage('history', { journal: 'observations', limit: 8, maxBytes: 16384 });
      const retainedBytes = await db.transaction(async tx => {
        let bytes = 0;
        for (const name of ['saves', 'worlds', 'observations', 'projections', 'events', 'contexts', 'receipts', 'witnesses', 'identities', 'controlReserve'] as const) {
          for (const value of await tx.objectStore(name).getAll()) bytes += new TextEncoder().encode(JSON.stringify(value)).byteLength;
        }
        return bytes;
      });
      samples.push({ entries: size, reads, milliseconds, retainedBytes, pageBytes: new TextEncoder().encode(JSON.stringify(page)).byteLength });
    }
    const sequences: number[] = [];
    let after: number | undefined;
    for (let pages = 0; pages < 513; pages++) {
      const page = await db.readDirectedHistoryPage('history', { journal: 'observations', after, limit: 32, maxBytes: 65536 });
      if (page.limitation) throw new Error(page.limitation);
      sequences.push(...page.entries.map(entry => Number(entry.key)));
      if (page.complete) break;
      after = page.next as number;
    }
    const audit = await db.auditDirectedSave('history');
    return { samples, sequences, original, replay: await db.captureDirectedContext('history', 'original', 'human-view'),
      sources: audit.observations.length, projections: audit.projections.length };
  });
  expect(new Set(result.samples.map(value => value.reads)).size).toBe(1);
  expect(result.samples.every(value => value.reads <= 12 && value.pageBytes <= 16384)).toBe(true);
  expect(result.sequences).toEqual(Array.from({ length: 512 }, (_, i) => i + 1));
  expect(result.sources).toBe(512); expect(result.projections).toBe(513);
  expect(result.replay).toEqual(result.original);
  await info.attach('history-growth.json', { body: JSON.stringify(result.samples, null, 2), contentType: 'application/json' });
  await writeFile(info.outputPath('history-growth.json'), JSON.stringify(result.samples, null, 2));
});

test('unread historical corruption is caught on access and full audit, not falsely claimed checked by normal load', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage;
    await db.transaction(async tx => {
      const source = (await tx.objectStore('observations').get(['history', 1]))!;
      source.scene.features[0].name = 'Corrupted name';
      await tx.objectStore('observations').put(source, ['history', 1]);
    });
    const normal = await db.readDirectedSave('history');
    const errors: string[] = [];
    for (const action of [() => db.readDirectedHistoryPage('history', { journal: 'observations', limit: 1 }),
      () => db.auditDirectedSave('history')]) {
      try { await action(); errors.push('unexpected success'); } catch (error) { errors.push(String(error)); }
    }
    return { normal: !!normal, errors };
  });
  expect(result.normal).toBe(true);
  expect(result.errors[0]).toContain('write witness mismatch');
  expect(result.errors[1]).toContain('historical projection differs from sources');
});

test('current checkpoint corruption and bounded page input fail closed', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const db = window.directedStorage, errors: string[] = [];
    for (const query of [{ journal: 'observations' as const, limit: 1000 }, { journal: 'contexts' as const, after: 4 },
      { journal: 'observations' as const, maxBytes: 1 }]) {
      try { await db.readDirectedHistoryPage('history', query); errors.push('unexpected success'); }
      catch (error) { errors.push(String(error)); }
    }
    await db.transaction(async tx => {
      const record = (await tx.objectStore('saves').get('history'))!;
      record.session.knowledge.features.V.value.state = 'active';
      await tx.objectStore('projections').put(record.session.knowledge, ['history', record.session.knowledge.revision]);
      await tx.objectStore('saves').put(record, 'history');
    });
    try { await db.readDirectedSave('history'); errors.push('unexpected success'); } catch (error) { errors.push(String(error)); }
    return errors;
  });
  expect(errors).toHaveLength(4); expect(errors.every(error => error !== 'unexpected success')).toBe(true);
  expect(errors[3]).toContain('head write witness mismatch');
});

test('full journal refuses new work but reserved cancellation, takeover and exact reload replay remain available', async ({ page }) => {
  test.setTimeout(180000);
  const saved = await page.evaluate(async () => {
    const db = window.directedStorage;
    await db.executeDirectedRequest('history', await db.request('history', 'travel', { type: 'navigate', operationId: 'trip',
      target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } }), 100);
    await db.fillDirectedReceiptCapacity('history');
    const before = (await db.readDirectedSave('history'))!;
    let exhausted = '';
    try { await db.executeDirectedRequest('history', await db.request('history', 'overflow', { type: 'look' }), 101); }
    catch (error) { exhausted = String(error); }
    const request = await db.request('history', 'emergency-stop', { type: 'cancel', operationId: 'trip' });
    const receipt = await db.executeDirectedRequest('history', request, 102);
    return { before, exhausted, request, receipt, after: await db.readDirectedSave('history') };
  });
  expect(saved.exhausted).toContain('receipts journal full');
  expect(saved.receipt.result.operation?.status).toBe('cancelled');
  expect(saved.after!.actor.position).toEqual(saved.before.actor.position);
  expect(saved.after!.knowledge).toEqual(saved.before.knowledge);
  await page.reload();
  const restored = await page.evaluate(async request => {
    const db = window.directedStorage;
    await db.claimDirectedSave('history', 'replacement-owner');
    return { replay: await db.executeDirectedRequest('history', request, 999), audit: await db.auditDirectedSave('history') };
  }, saved.request);
  expect(restored.replay).toEqual(saved.receipt);
  expect(restored.audit.receipts).toHaveLength(4097);
  expect(restored.audit.session.operation?.status).toBe('cancelled');
});

test('quota failure rolls back movement, evidence, witnesses and operation identity together', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage;
    await db.executeDirectedRequest('history', await db.request('history', 'travel', { type: 'navigate', operationId: 'trip',
      target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } }), 100);
    const request = await db.request('history', 'lost-write', { type: 'step', operationId: 'trip', sequence: 0 });
    const before = await db.auditDirectedSave('history');
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      if (this.name === 'receipts') throw new DOMException('Injected receipt quota exhaustion', 'QuotaExceededError');
      return add.apply(this, args);
    };
    let error = '';
    try { await db.executeDirectedRequest('history', request, 101); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; }
    const after = await db.auditDirectedSave('history');
    const absent = await db.reconcileDirectedRequest('history', request);
    const cancelled = await db.executeDirectedRequest('history', await db.request('history', 'cancel', { type: 'cancel', operationId: 'trip' }), 102);
    return { before, after, absent, error, cancelled };
  });
  expect(result.error).toContain('QuotaExceededError');
  expect(result.after).toEqual(result.before);
  expect(result.absent).toBeUndefined();
  expect(result.cancelled.result.operation?.status).toBe('cancelled');
});
