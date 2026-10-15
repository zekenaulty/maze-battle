import { test, expect, ready } from './canonical-decision-ack.test';

for (const field of ['run', 'request', 'action', 'admission', 'event', 'epoch', 'usage', 'state', 'adoption', 'settled', 'stop'])
  test(`changed service ${field} cannot ACK the retained handoff`, async ({ page }) => {
    const { proof } = await ready(page);
    const r = await page.evaluate(async ({ proof, field }) => {
      const c = window.canonicalDecisionAck, e = structuredClone(proof.entry);
      if (field === 'run') e.wakeRunId = 'foreign';
      if (field === 'request') e.request.objective = 'different objective';
      if (field === 'action') e.action.arguments = {};
      if (field === 'admission') e.admission!.summary = 'different admission';
      if (field === 'event') e.latestEvent!.observation.data.extra = null;
      if (field === 'epoch') e.activeEpoch = '99';
      if (field === 'usage') e.usage.steps++;
      if (field === 'state') e.state = 'parked';
      if (field === 'adoption') e.wakeAdoption = { adoptionId: 'invented', nextSessionEpoch: e.activeEpoch, observation: e.latestEvent!.observation };
      if (field === 'settled') Object.assign(e, { state: 'completed', settledUsage: e.usage });
      if (field === 'stop') Object.assign(e, { state: 'cancelled', stopDecision: { ...e.latestEvent!, eventId: 'different' } });
      const before = await c.dump(), error = await c.ack(e).then(() => 'accepted', String);
      return { error, unchanged: before === await c.dump(), state: await c.state() };
    }, { proof, field });
    expect(r.error).not.toBe('accepted'); expect(r.unchanged).toBe(true); expect(r.state.terminal!.operation.state).toBe('settled');
  });

test('intent without exact retained claim is not permission to release navigation', async ({ page }) => {
  const { proof } = await ready(page, false);
  const r = await page.evaluate(async p => { const c = window.canonicalDecisionAck, before = await c.dump();
    const error = await c.ack(p.entry).then(() => 'accepted', String); return { error, unchanged: before === await c.dump() }; }, proof);
  expect(r.error).toContain('retained intent and claim'); expect(r.unchanged).toBe(true);
});

for (const mutation of ['rewind', 'usage', 'completion-stop']) test(`settled claim rejects ${mutation}`, async ({ page }) => {
  const { proof } = await ready(page, false);
  const r = await page.evaluate(async ({ proof, mutation }) => {
    const c = window.canonicalDecisionAck, settledUsage = { ...proof.entry.usage, continuations: proof.entry.usage.continuations + 1 };
    const entry = { ...proof.entry, state: 'completed', settledUsage }; await c.claim({ ...proof, entry });
    const current = structuredClone(entry);
    if (mutation === 'rewind') { current.state = 'waking'; Object.assign(current, { settledUsage: null }); }
    if (mutation === 'usage') current.settledUsage.steps++;
    if (mutation === 'completion-stop') { await c.cancel(); Object.assign(current, { state: 'cancelled', stopDecision: current.latestEvent }); }
    const before = await c.dump(), error = await c.ack(current).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump() };
  }, { proof, mutation });
  expect(r.error).not.toBe('accepted'); expect(r.unchanged).toBe(true);
});

test('a remote Stop marker requires local cancellation; old delivery modes never accept wake custody', async ({ page }) => {
  const { proof } = await ready(page);
  const r = await page.evaluate(async proof => {
    const c = window.canonicalDecisionAck, before = await c.dump(), entry = { ...proof.entry, state: 'cancelled', stopDecision: proof.entry.latestEvent };
    const handoff = await c.ack(entry).then(() => 'accepted', String);
    const signal = await c.ack(entry, 'signal').then(() => 'accepted', String);
    await c.cancel(); const stoppedBefore = await c.dump(), stop = await c.ack(entry, 'stop-decision').then(() => 'accepted', String);
    return { handoff, signal, stop, changedByStop: before !== stoppedBefore, unchanged: stoppedBefore === await c.dump() };
  }, proof);
  expect(r.handoff).toContain('Stop evidence'); expect(r.signal).toContain('successor custody');
  expect(r.stop).toContain('successor custody'); expect(r.changedByStop).toBe(true); expect(r.unchanged).toBe(true);
});
