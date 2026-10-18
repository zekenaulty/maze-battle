import { test, expect, evidence } from './canonical-agentica-interaction.test';
import { admitSelected, confirmed, effectsOf, expectSingleChestEffect, pulse } from './canonical-agentica-interaction.support';
import { parkedPeer } from './canonical-agentica-interaction.peer';

test('absent service, reserved admission and unresolved probe cannot release chest apply', async ({ page }, info) => {
  const s = await admitSelected(page), peer = await parkedPeer(page, s.entry);
  peer.show(false);
  expect(await pulse(page)).toEqual({ status: 'awaiting-service' });
  peer.show(true); peer.reserveOnly(true);
  expect(await pulse(page)).toEqual({ status: 'awaiting-service' });
  expect((await page.evaluate(a => window.canonicalAgenticaInteraction.operation(a), s.action)).value).toBeNull();
  expect(await effectsOf(page)).toEqual(s.before);
  peer.reserveOnly(false); expect(await pulse(page)).toEqual({ status: 'confirmed' });
  const beforeProbe = await page.evaluate(() => window.canonicalAgenticaInteraction.dump());
  peer.unresolved(true);
  expect(await page.evaluate(() => window.canonicalAgenticaInteraction.pulse().catch(String))).toContain('unresolved');
  expect(await page.evaluate(() => window.canonicalAgenticaInteraction.dump())).toBe(beforeProbe);
  const pending = (await page.evaluate(a => window.canonicalAgenticaInteraction.operation(a), s.action)).value!;
  expect(pending.custodyAck).toBeNull(); expect(pending.progress).toMatchObject({ sequence: 0, status: 'pending', result: null });
  const early = await page.evaluate(async s => {
    const f = window.canonicalAgenticaInteraction, before = await f.dump();
    const error = await f.refusal(async () => f.apply(s.action, await f.applyRequest(s.operationId)));
    return { error, before, after: await f.dump() };
  }, { action: s.action, operationId: s.operationId });
  expect(early.error.message).toContain('custody probe is not acknowledged'); expect(early.after).toBe(early.before);
  expect(await effectsOf(page)).toEqual(s.before);
  peer.unresolved(false); expect(await pulse(page)).toEqual({ status: 'custody-confirmed' });
  expect(peer.deliveries).toEqual([pending.confirmation.data.probe, pending.confirmation.data.probe]);
  expect(await pulse(page)).toEqual({ status: 'applied-interaction', sequence: 1 });
  expectSingleChestEffect(s.before, await effectsOf(page)); expect(peer.violations).toEqual([]);
  await evidence(info, 'parked-custody-gate.json', { s, pending, early, deliveries: peer.deliveries });
});

test('HTTP success without exact probe ACK cannot authorize apply', async ({ page }, info) => {
  const s = await admitSelected(page), peer = await parkedPeer(page, s.entry);
  expect(await pulse(page)).toEqual({ status: 'confirmed' }); peer.malformedReply(true);
  const before = await page.evaluate(() => window.canonicalAgenticaInteraction.dump());
  const failure = await page.evaluate(() => window.canonicalAgenticaInteraction.refusal(() => window.canonicalAgenticaInteraction.pulse()));
  expect(failure.rejected).toBe(true); expect(await page.evaluate(() => window.canonicalAgenticaInteraction.dump())).toBe(before);
  const pending = (await page.evaluate(a => window.canonicalAgenticaInteraction.operation(a), s.action)).value!;
  expect(pending.custodyAck).toBeNull(); expect(pending.progress.sequence).toBe(0); expect(await effectsOf(page)).toEqual(s.before);
  expect(await page.evaluate(() => window.canonicalAgenticaInteraction.status())).toEqual({ controlled: false, recoveryRequired: true });
  peer.malformedReply(false); await page.evaluate(() => window.canonicalAgenticaInteraction.cancel());
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  expect(peer.deliveries[0]).toEqual(pending.confirmation.data.probe);
  expect(peer.deliveries.map(e => [e.sequence, e.kind])).toEqual([[1, 'progress'], [2, 'cancelled']]);
  expect(await effectsOf(page)).toEqual(s.before); expect(peer.violations).toEqual([]);
  await evidence(info, 'malformed-custody-ack.json', { s, failure, pending, deliveries: peer.deliveries });
});

test('lost probe reply survives driver replacement and retries only the exact probe', async ({ page }, info) => {
  const s = await admitSelected(page), peer = await parkedPeer(page, s.entry);
  await pulse(page); peer.loseNext(1);
  expect(await page.evaluate(() => window.canonicalAgenticaInteraction.pulse().catch(String))).toContain('fetch');
  const pending = (await page.evaluate(a => window.canonicalAgenticaInteraction.operation(a), s.action)).value!;
  expect(pending.custodyAck).toBeNull(); expect(await effectsOf(page)).toEqual(s.before);
  await page.evaluate(async s => { const f = window.canonicalAgenticaInteraction; f.closeDriver(); await f.attachDriver(s.action, s.binding); },
    { action: s.action, binding: s.binding });
  expect(await pulse(page)).toEqual({ status: 'custody-confirmed' });
  expect(peer.deliveries).toEqual([pending.confirmation.data.probe, pending.confirmation.data.probe]);
  expect(await effectsOf(page)).toEqual(s.before);
  expect(await pulse(page)).toEqual({ status: 'applied-interaction', sequence: 1 });
  expectSingleChestEffect(s.before, await effectsOf(page)); expect(peer.violations).toEqual([]);
  await evidence(info, 'lost-probe-replacement.json', { s, pending, deliveries: peer.deliveries });
});

test('progress ACK must match the actual sanitized event, not merely its HTTP identity', async ({ page }, info) => {
  const { s, peer } = await confirmed(page); await pulse(page);
  const r = await page.evaluate(async s => {
    const f = window.canonicalAgenticaInteraction, state = (await f.operation(s.action)).value!, beforeEffects = await f.effects();
    const entry = await f.signalProgress(state.event!.data.event), changed = structuredClone(entry);
    changed.latestEvent!.summary = 'Different retained outcome';
    const before = await f.dump(), refusal = await f.refusal(() => f.acknowledgeProgress(s.action, changed)), afterRefusal = await f.dump();
    const accepted = await f.acknowledgeProgress(s.action, entry);
    return { state, entry, beforeEffects, before, refusal, afterRefusal, accepted, after: await f.operation(s.action), effects: await f.effects() };
  }, { action: s.action });
  expect(r.refusal.rejected).toBe(true); expect(r.afterRefusal).toBe(r.before);
  expect(r.after.value!.acknowledgement!.data.entry).toEqual(r.entry);
  expect(r.after.value!.progress).toEqual(r.state.progress); expect(r.effects).toEqual(r.beforeEffects);
  expect(peer.deliveries).toEqual([r.state.confirmation.data.probe, r.state.event!.data.event]); expect(peer.violations).toEqual([]);
  await evidence(info, 'exact-progress-ack.json', r);
});
