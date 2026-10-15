import { test, expect, arrived, prepare, reload } from './canonical-decision.test';
import type { GameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';

test('three earned steps then explicit intent retain a current actor event without changing terminal history or authority', async ({ page }) => {
  await arrived(page);
  const before = await page.evaluate(() => window.canonicalDecision.state()), after = await prepare(page), d = after.intent!;
  const checkpoint = before.head.checkpoint as unknown as GameCheckpoint;
  expect(before.operation!.operation.state).toBe('settled'); expect(before.intent).toBeNull(); expect(before.claim).toBeNull();
  expect(d.data.binding).toEqual(before.operation!.confirmation.data.binding);
  expect(d.data.confirmation).toEqual(before.operation!.confirmation.reference);
  expect(d.data.terminalAttemptId).toBe(before.terminal!.source.attemptId); expect(d.data.adoption).toBeNull();
  expect(d.data.event).toEqual({ ...before.terminal!.event, eventId: d.source.attemptId,
    observation: { observationId: `decision-${d.source.attemptId}`, revision: d.publication.wireRevision,
      observedAt: before.head.checkpoint.updatedAt, data: { scope: 'actor', actor: {
        level: checkpoint.position.level, ...checkpoint.position.cell,
        facing: checkpoint.facing, mode: checkpoint.mode }, source: d.publication.observation } } });
  expect(d.data.event.observation.revision).toBeGreaterThan(before.terminal!.event.observation.revision);
  expect(after.terminal).toEqual(before.terminal); expect(after.operation).toEqual(before.operation);
  expect(after.launch).toEqual(before.launch); expect(after.selection).toEqual(before.selection);
  expect(after.head.roots.world).toBe(before.head.roots.world); expect(after.head.roots.knowledge).toBe(before.head.roots.knowledge);
  const replay = await page.evaluate(async () => {
    const c = window.canonicalDecision, before = await c.dump(), result = await c.replay('agentica.operation.decision');
    return { result, unchanged: before === await c.dump() };
  });
  expect(replay.result.replayed).toBe(true); expect(replay.unchanged).toBe(true);
});

for (const steps of [0, 2, 3]) test(`intent before settlement refuses after ${steps} steps without writes`, async ({ page }) => {
  await page.evaluate(() => window.canonicalDecision.boot());
  for (let i = 0; i < steps; i++) await page.evaluate(() => window.canonicalDecision.advance());
  const r = await page.evaluate(async () => {
    const c = window.canonicalDecision, pub = await c.publish(), before = await c.dump();
    const error = await c.prepare(pub).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump(), state: await c.state() };
  });
  expect(r.error).toContain('unacknowledged completed navigation'); expect(r.unchanged).toBe(true); expect(r.state.intent).toBeNull();
});

test('old publication is refused without retaining an intention', async ({ page }) => {
  const seed = await arrived(page);
  const old = await page.evaluate(async pub => {
    const c = window.canonicalDecision, before = await c.dump(), error = await c.prepare(pub).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump() };
  }, seed.binding.publication);
  expect(old.error).toContain('publication game state or custody changed'); expect(old.unchanged).toBe(true);
  expect((await page.evaluate(() => window.canonicalDecision.state())).intent).toBeNull();
});

test('a second changed intent is refused without replacing the original', async ({ page }) => {
  await arrived(page);
  const original = await prepare(page);
  const changed = await page.evaluate(async () => {
    const c = window.canonicalDecision, pub = await c.publish(), before = await c.dump(), error = await c.prepare(pub).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump(), state: await c.state() };
  });
  expect(changed.error).toContain('reconcile original decision'); expect(changed.unchanged).toBe(true);
  expect(changed.state.intent).toEqual(original.intent); expect(changed.state.terminal).toEqual(original.terminal);
});

test('exact claim retry and duplicate preserve one claim and never select or authorize the successor', async ({ page }) => {
  await arrived(page); const before = await prepare(page);
  const r = await page.evaluate(async () => {
    const c = window.canonicalDecision, proof = await c.proof(), receipt = await c.claim(proof), claimed = await c.state();
    const exactBefore = await c.dump(), exact = await c.replay('agentica.operation.decision-claim'), exactUnchanged = exactBefore === await c.dump();
    const duplicate = await c.claim(proof), afterDuplicate = await c.state(), beforeGate = await c.dump();
    const refused = await c.gate(proof).then(() => 'accepted', String);
    return { proof, receipt, claimed, exact, exactUnchanged, duplicate, afterDuplicate, refused, gateUnchanged: beforeGate === await c.dump() };
  });
  expect(r.claimed.claim!.data).toEqual({ intent: before.intent!.reference, started: r.proof.started, usage: r.proof.entry.usage,
    state: 'waking', settledUsage: null, stopped: false });
  expect(r.exact.replayed).toBe(true); expect(r.exact.receipt).toEqual(r.receipt); expect(r.exactUnchanged).toBe(true);
  expect(r.duplicate.result).toEqual({ reference: r.claimed.claim!.reference }); expect(r.afterDuplicate.claim).toEqual(r.claimed.claim);
  expect(r.afterDuplicate.launch).toEqual(before.launch); expect(r.afterDuplicate.selection).toEqual(before.selection);
  expect(r.afterDuplicate.terminal).toEqual(before.terminal); expect(r.afterDuplicate.operation).toEqual(before.operation);
  expect(r.refused).toContain('outside launch grant'); expect(r.gateUnchanged).toBe(true);
});

test('reload only reads historical intention and claim; a new owner cannot replace the existing intention', async ({ page }) => {
  const seed = await arrived(page); await prepare(page);
  await page.evaluate(async () => { const c = window.canonicalDecision; await c.claim(await c.proof()); });
  const original = await page.evaluate(() => window.canonicalDecision.state()); await reload(page, seed);
  const read = await page.evaluate(async () => {
    const c = window.canonicalDecision, before = await c.dump(), state = await c.state();
    return { state, unchanged: before === await c.dump() };
  });
  expect(read.state).toEqual(original); expect(read.unchanged).toBe(true);
  const newer = await page.evaluate(async () => {
    const c = window.canonicalDecision; await c.startOwner(); const pub = await c.publish(), before = await c.dump();
    const error = await c.prepare(pub).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump(), state: await c.state() };
  });
  expect(newer.state.head.epoch).toBeGreaterThan(original.head.epoch);
  expect(newer.error).toContain('reconcile original decision'); expect(newer.unchanged).toBe(true);
  expect(newer.state.intent).toEqual(original.intent); expect(newer.state.claim).toEqual(original.claim);
});
