import { test, expect } from './canonical-decision-controller.test';

test('create and prepare retain an explicit intent without connecting, waking or granting', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot();
    const publication = await c.publish(), beforeCreate = await c.dump(); await c.create();
    const createUnchanged = beforeCreate === await c.dump(), reference = await c.prepare(publication), prepared = await c.state();
    return { createUnchanged, reference, publication, prepared, calls: c.calls(), control: c.control() };
  });
  expect(result.createUnchanged).toBe(true); expect(result.calls).toEqual([]); expect(result.control.binding).toBeNull();
  expect(result.prepared.intent!.reference).toEqual(result.reference);
  expect(result.prepared.intent!.data.publication).toEqual(result.publication);
  expect(result.prepared.intent!.data.event.eventId).toBe(result.prepared.intent!.source.attemptId);
  expect(result.prepared.intent!.data.event.observation.observationId).toBe(`decision-${result.prepared.intent!.source.attemptId}`);
  expect(result.prepared.claim).toBeNull(); expect(result.prepared.grant).toBeNull();
});

test('explicit pulse connects before delivering the exact retained predecessor and waking', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.rewindPrefix(); const connected = await c.pulse(), afterConnect = c.calls();
    const delivered = await c.pulse(), beforeWake = c.calls(), state = await c.state();
    const claimed = await c.pulse(); return { connected, afterConnect, delivered, beforeWake, state, claimed, calls: c.calls() };
  });
  expect(result.connected.status).toBe('connected'); expect(result.afterConnect.map(c => c.method)).toEqual(['connect']);
  expect(result.delivered).toMatchObject({ status: 'prefix-delivered', sequence: result.state.prefix.previous!.sequence });
  expect(result.beforeWake.map(c => c.method)).toEqual(['connect', 'list', 'signal']);
  expect(result.beforeWake.at(-1)!.input).toEqual(result.state.prefix.previous);
  expect(result.claimed.status).toBe('claimed');
  const wake = result.calls.find(c => c.method === 'wake')!;
  expect(wake.input).toEqual({ event: result.state.intent!.data.event, adoption: null });
  expect(wake.observed).toMatchObject({ intent: { reference: result.state.intent!.reference }, claim: null, grant: null });
  expect(result.calls.filter(c => c.method === 'list').map(c => c.input)).toEqual([
    { hostId: 'maze-battle', sessionId: result.state.intent!.data.event.sessionId },
    { hostId: 'maze-battle', sessionId: result.state.intent!.data.event.sessionId },
    { hostId: 'maze-battle', sessionId: result.state.intent!.data.event.sessionId },
  ]);
});

test('a different second publication cannot replace the retained decision intention', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    const next = await c.publish(), before = await c.dump();
    let error = ''; try { await c.prepare(next); } catch (cause) { error = String(cause); }
    return { error, unchanged: before === await c.dump(), calls: c.calls(), state: await c.state() };
  });
  expect(result.error).toBeTruthy(); expect(result.unchanged).toBe(true); expect(result.calls).toEqual([]);
  expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
});
