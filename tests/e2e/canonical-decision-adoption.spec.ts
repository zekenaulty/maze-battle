import { test, expect, arrived, reload } from './canonical-decision.test';
import type { GameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';

test('new-owner explicit intention keeps the old terminal event and puts only current publication in adoption', async ({ page }) => {
  const seed = await arrived(page), original = await page.evaluate(() => window.canonicalDecision.state()); await reload(page, seed);
  const r = await page.evaluate(async () => {
    const c = window.canonicalDecision, beforeRead = await c.dump(), read = await c.state(), readUnchanged = beforeRead === await c.dump();
    const head = await c.startOwner(), beforePrepare = await c.state();
    await c.prepare(await c.publish()); const prepared = await c.state(), proof = await c.proof();
    for (const observation of [proof.entry.latestEvent!.observation, proof.entry.wakeAdoption!.observation]) {
      observation.observedAt = observation.observedAt.replace(/\.(\d{3})Z$/, '.$10000+00:00');
      (observation as unknown as Record<string, unknown>).facts = null;
    }
    await c.claim(proof); return { read, readUnchanged, head, beforePrepare, prepared, claimed: await c.state() };
  });
  expect(r.readUnchanged).toBe(true); expect(r.read.intent).toBeNull(); expect(r.beforePrepare.intent).toBeNull();
  expect(r.head.epoch).toBeGreaterThan(original.head.epoch); const d = r.prepared.intent!;
  const checkpoint = r.head.checkpoint as unknown as GameCheckpoint;
  expect(d.data.event).toEqual(original.terminal!.event); expect(r.prepared.terminal).toEqual(original.terminal);
  expect(d.data.adoption).toEqual({ adoptionId: d.source.attemptId, nextSessionEpoch: String(r.head.epoch), observation: {
    observationId: `decision-${d.source.attemptId}`, revision: d.publication.wireRevision,
    observedAt: r.head.checkpoint.updatedAt, data: { scope: 'actor', actor: {
      level: checkpoint.position.level, ...checkpoint.position.cell,
      facing: checkpoint.facing, mode: checkpoint.mode }, source: d.publication.observation } } });
  expect(r.claimed.claim!.data.started.sessionEpoch).toBe(String(r.head.epoch));
  expect(r.claimed.selection).toEqual(original.selection); expect(r.claimed.launch.grant).toEqual(original.launch.grant);
  expect(r.claimed.launch.guard).toEqual(original.launch.guard); expect(r.claimed.operation).toEqual(original.operation);
});

for (const changed of ['missing', 'id', 'epoch', 'observation', 'old-epoch-event']) test(`new-owner claim rejects changed adoption ${changed}`, async ({ page }) => {
  const seed = await arrived(page); await reload(page, seed);
  await page.evaluate(async () => { const c = window.canonicalDecision; await c.startOwner(); await c.prepare(await c.publish()); });
  const r = await page.evaluate(async changed => {
    const c = window.canonicalDecision, p = await c.proof();
    if (changed === 'missing') delete p.entry.wakeAdoption;
    if (changed === 'id') p.entry.wakeAdoption!.adoptionId = 'foreign';
    if (changed === 'epoch') p.entry.wakeAdoption!.nextSessionEpoch = String(Number(p.entry.activeEpoch) + 1);
    if (changed === 'observation') p.entry.wakeAdoption!.observation.data = { foreign: true };
    if (changed === 'old-epoch-event') p.entry.latestEvent!.observation = p.entry.wakeAdoption!.observation;
    const before = await c.dump(), error = await c.claim(p).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump(), state: await c.state() };
  }, changed);
  expect(r.error).toBe('Error: Canonical storage: service did not retain exact decision operation');
  expect(r.unchanged).toBe(true); expect(r.state.claim).toBeNull();
});
