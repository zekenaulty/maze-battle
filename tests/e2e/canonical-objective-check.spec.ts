import { test, expect, evidence } from './canonical-objective-check.test';
import { observationKey } from '../../src/persistence/canonical/knowledge/keys';
import { observationHeaderRecord } from '../../src/persistence/canonical/knowledge/observation.validation';

test('ordinary collection and earned return satisfy; stashing clears custody; exact result survives reload', async ({ page }, info) => {
  const initial = await page.evaluate(async () => {
    const f = window.canonicalObjectiveCheck, boot = await f.boot('route'), before = await f.fingerprint(true);
    const pending = await f.check(true);
    return { boot, before, pending, after: await f.fingerprint(true) };
  });
  expect(initial.boot.route!.moves).toBeGreaterThan(0);
  expect(initial.after).toEqual(initial.before);
  expect(initial.pending.result).toMatchObject({ disposition: 'applied',
    observation: { data: { status: 'pending', carried: 0, questStatus: 'active', atReturn: false } } });
  expect(initial.pending.result.completion).toBeUndefined();
  expect(initial.pending.accesses.filter(r => r.area === 'world' && r.method === 'get')).toHaveLength(8);
  expect(initial.pending.accesses.filter(r => r.area === 'world' && r.method === 'scan').map(r => r.count)).toEqual([1]);
  expect(initial.pending.accesses.filter(r => r.area === 'knowledge')).toEqual([]);
  const collected = await page.evaluate(async () => {
    const f = window.canonicalObjectiveCheck, returned = await f.collect(), before = await f.fingerprint(true);
    const satisfied = await f.check(true);
    return { returned, before, satisfied, after: await f.fingerprint(true) };
  });
  await evidence(info, 'arrival-read-scope.json', { observation: collected.satisfied.observation, accesses: collected.satisfied.accesses });
  expect(collected.returned.steps).toBeGreaterThan(0);
  expect(collected.returned.effects.questItems).toHaveLength(1);
  expect(collected.returned.effects.quest.quest.status).toBe('complete');
  expect(collected.after).toEqual(collected.before);
  expect(collected.satisfied.result).toMatchObject({ disposition: 'applied', completion: {
    objectiveId: initial.boot.objectiveId, evidenceId: collected.satisfied.result.evidenceId,
  }, observation: { data: { status: 'satisfied', carried: 1, questStatus: 'complete', atReturn: true } } });
  expect(collected.satisfied.retained.source.objective!.publication).toEqual(initial.boot.root);
  expect(collected.satisfied.accesses.filter(r => r.area === 'world' && r.method === 'get')).toHaveLength(8);
  expect(collected.satisfied.accesses.filter(r => r.area === 'world' && r.method === 'scan').map(r => r.count)).toEqual([1, 1]);
  expect(collected.satisfied.accesses.filter(r => r.area === 'knowledge' && r.method === 'get').length).toBeLessThanOrEqual(18);
  expect(collected.satisfied.accesses.filter(r => r.area === 'knowledge' && r.method === 'witness')).toHaveLength(1);
  const probe = collected.satisfied.observation;
  if (!probe?.anchor || !probe.header || !probe.integrity) throw Error('Missing original arrival observation proof');
  const header = observationHeaderRecord(probe.header, { sequence: probe.anchor.sequence, id: probe.anchor.id });
  const key = observationKey(probe.anchor.sequence), pass = [key, `${key}/integrity`, ...header.chunks.map((_, index) => `${key}/${index}`)];
  expect(collected.satisfied.retained.source.objective!.evidence.arrival).toMatchObject({ sequence: probe.anchor.sequence, id: probe.anchor.id });
  const integrity = probe.integrity.value;
  if (!integrity || typeof integrity !== 'object' || Array.isArray(integrity)) throw Error('Invalid original integrity record');
  expect(probe.integrity.key).toBe(`${key}/integrity`); expect(integrity.recordId).toBe(probe.anchor.id);
  expect(collected.satisfied.accesses.filter(r => r.area === 'knowledge')).toEqual([
    { method: 'witness', area: 'knowledge', key: 'perception/' },
    ...[...pass, ...pass].map(key => ({ method: 'get', area: 'knowledge', key })),
  ]);
  const rejected = await page.evaluate(async anchor => {
    const f = window.canonicalObjectiveCheck, before = await f.fingerprint();
    return { before, reads: await f.rejectForeignObservationReads(anchor), after: await f.fingerprint() };
  }, probe.anchor);
  expect(rejected.after).toEqual(rejected.before);
  expect(rejected.reads.refusals).toHaveLength(6);
  for (const refusal of rejected.reads.refusals) expect(refusal.message).toBe(`Error: Unexpected memory or history read: ${refusal.key}`);
  expect(JSON.stringify(collected.satisfied.result)).not.toContain(initial.boot.questId);
  const stashed = await page.evaluate(async () => {
    const f = window.canonicalObjectiveCheck; await f.stash();
    const before = await f.fingerprint(true), pending = await f.check();
    return { pending, before, after: await f.fingerprint(true) };
  });
  expect(stashed.after).toEqual(stashed.before);
  expect(stashed.pending.result).toMatchObject({ disposition: 'applied',
    observation: { data: { status: 'pending', carried: 0, atReturn: true, questStatus: 'complete' } } });
  expect(stashed.pending.retained.source.objective!.evidence.quest).toMatchObject({ packCount: 0, stashCount: 1 });
  expect(stashed.pending.result.completion).toBeUndefined();
  await page.reload(); await page.waitForFunction(() => !!window.canonicalObjectiveCheck);
  const replay = await page.evaluate(async original => {
    const f = window.canonicalObjectiveCheck, head = await f.resume(), before = await f.fingerprint();
    const retained = await f.retained(original, true), result = await f.perform(original);
    return { head, before, retained, result, after: await f.fingerprint() };
  }, collected.satisfied.original);
  expect(replay.head.epoch).toBeGreaterThan(initial.boot.head.epoch);
  expect(replay.retained.source).toEqual(collected.satisfied.retained.source);
  expect(replay.result).toEqual(collected.satisfied.result);
  expect(replay.after).toEqual(replay.before);
  expect(replay.retained.accesses.every(r => r.area === 'execution')).toBe(true);
  await evidence(info, 'pending-satisfied-stashed-historical-replay.json', { initial, collected, rejected, stashed, replay });
});

test('unbound launch refuses the objective query without claiming completion', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalObjectiveCheck; await f.boot('unbound');
    const before = await f.fingerprint(true), checked = await f.check();
    return { before, checked, after: await f.fingerprint(true) };
  });
  expect(r.checked.result.disposition).toBe('refused'); expect(r.checked.result.summary).toContain('no owner-selected');
  expect(r.checked.result.completion).toBeUndefined(); expect(r.checked.retained.source.objective).toBeUndefined();
  expect(r.after).toEqual(r.before);
  await evidence(info, 'unbound-objective-refusal.json', r);
});

test('old inspect grant cannot reserve the new objective scope and writes nothing', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalObjectiveCheck; await f.boot('old-scope');
    const original = await f.action(), before = await f.fingerprint(), refusal = await f.refusal(() => f.reserve(original));
    return { before, refusal, after: await f.fingerprint() };
  });
  expect(r.refusal).toMatchObject({ rejected: true, message: expect.stringContaining('inspection was not granted') });
  expect(r.after).toEqual(r.before);
  await evidence(info, 'old-scope-no-reservation.json', r);
});

for (const kind of ['cloned', 'mutated', 'false-completion', 'arbitrary', 'observe'] as const)
  test(`${kind} proof or completion cannot enter a native result receipt`, async ({ page }, info) => {
    const r = await page.evaluate(async kind => {
      const f = window.canonicalObjectiveCheck; await f.boot();
      return f.forge(kind);
    }, kind);
    expect(r.result.rejected).toBe(true); expect(r.after).toBe(r.before);
    await evidence(info, `native-${kind}-refusal.json`, { result: r.result, unchanged: r.after === r.before });
  });

for (const kind of ['root', 'admission', 'arrival', 'completion'] as const)
  test(`missing or tampered ${kind} source rejects historical replay without refresh`, async ({ page }, info) => {
    const r = await page.evaluate(async kind => {
      const f = window.canonicalObjectiveCheck; await f.boot(); await f.renew();
      const original = await f.check(); await f.damage(original.original, kind);
      const before = await f.fingerprint(), refused = await f.refusal(() => f.retained(original.original, true));
      return { original, before, refused, after: await f.fingerprint() };
    }, kind);
    expect(r.refused.rejected).toBe(true); expect(r.after).toEqual(r.before);
    await evidence(info, `historical-${kind}-refusal.json`, r);
  });

test('actual action hooks snapshot caller input across asynchronous reservation', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalObjectiveCheck; await f.boot();
    const original = await f.action(), selected = structuredClone(original), pending = f.reserve(original);
    original.actionId = 'mutated-after-call'; original.arguments.scope = 'room'; await pending;
    const before = await f.fingerprint(true), result = await f.perform(selected), kept = await f.retained(selected);
    return { selected, result, kept, before, after: await f.fingerprint(true) };
  });
  expect(r.result.actionId).toBe(r.selected.actionId);
  expect(r.result.observation!.data.scope).toBe('objective');
  expect(r.kept.action.original.action).toEqual(r.selected); expect(r.after).toEqual(r.before);
  await evidence(info, 'action-hook-caller-snapshot.json', r);
});
