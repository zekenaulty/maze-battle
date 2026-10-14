import { expect, test } from './canonical-verified-ack.test';
import type { AcknowledgementRead } from '../../src/persistence/canonical/acknowledgement';
import type { JsonObject } from '../../src/persistence/canonical/types';

test('verifier exposes only bounded execution/source reads and never world mutation methods', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { admission, terminal, ack } = await c.settled();
    const before = (await c.readCanonicalHead()).head; let keys: string[] = [], sources: unknown[] = [];
    const commit = await c.acknowledgeCanonical(ack, async (view, original) => {
      keys = Object.keys(view).sort();
      const execution = await view.get('execution', 'proof-source');
      const source = await view.sourceReceipt(admission.attemptId), end = await view.sourceReceipt(terminal.attemptId);
      const operation = await view.liveOperation('verified-operation');
      sources = [execution?.value, source.receipt.attemptId, end.receipt.attemptId, operation?.state];
      // Mutating returned metadata must not change the kernel's private request or original source.
      (original.input as JsonObject).proof = { changed: true };
      if (operation) operation.binding.changed = true;
      source.receipt.result = { changed: true };
    });
    const after = (await c.readCanonicalHead()).head;
    return { keys, sources, commit, before, after, original: ack, dump: await c.dump() };
  });
  expect(result.keys).toEqual(['get', 'liveOperation', 'savedSnapshot', 'sourceReceipt']);
  expect(result.sources).toEqual([{ admitted: true }, expect.any(String), expect.any(String), 'settled']);
  expect(JSON.parse(result.commit.receipt.fingerprint)).toEqual(result.original);
  expect(result.commit.receipt.result).toEqual({ operationId: 'verified-operation', phase: 'acknowledge' });
  expect(result.after.roots).toEqual(result.before.roots); expect(result.after.checkpoint).toEqual(result.before.checkpoint);
  expect(result.after.quota).toMatchObject({ reservations: 0, reservedBytes: 0, usedBytes: result.dump.bytes });
});

for (const area of ['world', 'knowledge'] as const) for (const swallowed of [false, true]) test(`${area} access ${swallowed ? 'caught' : 'uncaught'} aborts ACK`, async ({ page }) => {
  const result = await page.evaluate(async ({ area, swallowed }) => {
    const c = window.verifiedAck, { ack } = await c.settled(), before = await c.dump();
    const error = await c.failure(() => c.acknowledgeCanonical(ack, async view => {
      const read = view.get(area, 'secret');
      if (swallowed) await read.catch(() => undefined); else await read;
    }));
    return { error, before, after: await c.dump() };
  }, { area, swallowed });
  expect(result.error).toContain(swallowed ? 'acknowledgement read is not usable' : 'cannot read hidden world');
  expect(result.after).toEqual(result.before);
});

for (const method of ['get', 'sourceReceipt', 'liveOperation'] as const) test(`detached ${method} read cannot authorize reserve release`, async ({ page }) => {
  const result = await page.evaluate(async method => {
    const c = window.verifiedAck, { admission, ack } = await c.settled(), before = await c.dump();
    let detached: Promise<unknown> | undefined;
    const error = await c.failure(() => c.acknowledgeCanonical(ack, async view => {
      detached = (method === 'get' ? view.get('execution', 'proof-source') : method === 'sourceReceipt'
        ? view.sourceReceipt(admission.attemptId) : view.liveOperation('verified-operation')).catch(String);
    }));
    await detached;
    return { error, before, after: await c.dump() };
  }, method);
  expect(result.error).toContain('acknowledgement read is not usable'); expect(result.after).toEqual(result.before);
});

test('retained verifier closures reject every read after completion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { admission, ack } = await c.settled(); let retained: AcknowledgementRead | undefined;
    await c.acknowledgeCanonical(ack, async view => { retained = view; }); const before = await c.dump();
    const errors = [];
    for (const read of [() => retained!.get('execution', 'proof-source'), () => retained!.sourceReceipt(admission.attemptId),
      () => retained!.savedSnapshot('missing'), () => retained!.liveOperation('verified-operation')]) errors.push(await c.failure(read));
    return { errors, before, after: await c.dump() };
  });
  expect(result.errors).toHaveLength(4);
  for (const error of result.errors) expect(error).toContain('acknowledgement view is closed');
  expect(result.after).toEqual(result.before);
});

test('failed source lookup remains fatal when the verifier catches it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled(), before = await c.dump();
    const error = await c.failure(() => c.acknowledgeCanonical(ack, async view => {
      await view.sourceReceipt('invalid/id').catch(() => undefined);
    }));
    return { error, before, after: await c.dump() };
  });
  expect(result.error).toContain('acknowledgement read is not usable'); expect(result.after).toEqual(result.before);
});

test('missing world and knowledge trees cannot obstruct funded cancel or execution-only ACK', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck; await c.seed(); const { request: admission } = await c.admit();
    const head = (await c.readCanonicalHead()).head, db = await c.openCanonicalDatabase();
    try {
      await db.delete('nodes', [head.gameId, head.roots.world!]);
      await db.delete('nodes', [head.gameId, head.roots.knowledge!]);
    } finally { db.close(); }
    const worldError = await c.failure(() => c.readCanonical(p => p.get('world', 'secret')));
    const knowledgeError = await c.failure(() => c.readCanonical(p => p.get('knowledge', 'earned')));
    const terminal = await c.fresh('operation.cancel', { operationId: 'verified-operation' });
    await c.operateCanonical(terminal, 'cancel');
    const ack = await c.fresh('operation.acknowledge', { operationId: 'verified-operation', terminalAttemptId: terminal.attemptId, proof: { confirmed: true } });
    await c.acknowledgeCanonical(ack, async view => {
      await view.sourceReceipt(admission.attemptId); await view.sourceReceipt(terminal.attemptId);
      await view.get('execution', 'proof-source');
    });
    return { worldError, knowledgeError, initial: head, final: (await c.readCanonicalHead()).head };
  });
  expect(result.worldError).not.toBe(''); expect(result.knowledgeError).not.toBe('');
  expect(result.final.roots).toEqual(result.initial.roots); expect(result.final.checkpoint).toEqual(result.initial.checkpoint);
  expect(result.final.quota).toMatchObject({ reservations: 0, reservedBytes: 0 });
});

test('ACK snapshots caller proof synchronously before any database await', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled(), original = structuredClone(ack);
    let observed: unknown;
    const pending = c.acknowledgeCanonical(ack, async (_view, request) => { observed = request.input; });
    (ack.input as JsonObject).proof = { changed: 'after-call' }; ack.attemptId = 'changed-after-call';
    const commit = await pending;
    return { original, observed, commit, replay: await c.replayAcknowledgement(original) };
  });
  expect(result.observed).toEqual(result.original.input);
  expect(JSON.parse(result.commit.receipt.fingerprint)).toEqual(result.original);
  expect(result.replay).toMatchObject({ replayed: true, receipt: result.commit.receipt });
});
