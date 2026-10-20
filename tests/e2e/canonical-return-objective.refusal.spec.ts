import { test, expect, evidence } from './canonical-return-objective.test';

for (const kind of ['none', 'other', 'missing'] as const)
  test(`${kind} quest cannot obtain a typed publication or launch grant`, async ({ page }, info) => {
    const r = await page.evaluate(async kind => {
      const f = window.canonicalReturnObjective; await f.boot(kind === 'missing' ? 'fetch' : kind);
      const before = await f.dump();
      const result = await f.refusal(() => kind === 'missing' ? f.prepare(false, 'not-an-accepted-quest') : f.prepare());
      return { before, result, after: await f.dump(), state: await f.nativeState() };
    }, kind);
    expect(r.result.rejected).toBe(true);
    expect(r.result.message).toMatch(kind === 'other' ? /one accepted floor-one fetch item/ : /selected accepted quest is missing/);
    expect(r.after).toBe(r.before); expect(r.state.operations).toEqual([]);
    expect(r.state.head.allocations).toEqual({});
    await evidence(info, `ungrantable-${kind}-quest.json`, r);
  });

for (const defect of ['floor', 'multiple', 'checkpoint'] as const)
  test(`${defect} mismatch refuses before granting and leaves the exact native state`, async ({ page }, info) => {
    const r = await page.evaluate(async defect => {
      const f = window.canonicalReturnObjective; await f.boot();
      if (defect === 'checkpoint') await f.wrongLevel(); else await f.changeQuestShape(defect);
      const before = await f.dump(), result = await f.refusal(() => f.publishDirect());
      return { before, result, after: await f.dump(), state: await f.nativeState() };
    }, defect);
    expect(r.result.rejected).toBe(true);
    expect(r.result.message).toMatch(defect === 'checkpoint' ? /manual floor-one control/ : /one accepted floor-one fetch item/);
    expect(r.after).toBe(r.before); expect(r.state.operations).toEqual([]);
    await evidence(info, `binding-${defect}-refusal.json`, r);
  });

for (const kind of ['source', 'memory'] as const)
  test(`missing earned entrance ${kind} explicitly refuses without writes`, async ({ page }, info) => {
    const r = await page.evaluate(async kind => {
      const f = window.canonicalReturnObjective; await f.boot(); const removed = await f.removeEntranceEvidence(kind);
      const before = await f.dump(), result = await f.refusal(() => f.publishDirect());
      return { removed, before, result, after: await f.dump(), state: await f.nativeState() };
    }, kind);
    expect(r.result.rejected).toBe(true);
    expect(r.result.message).toMatch(kind === 'source' ? /missing|record/ : /memory|known|source/);
    expect(r.after).toBe(r.before); expect(r.state.operations).toEqual([]);
    await evidence(info, `entrance-${kind}-refusal.json`, r);
  });

for (const wrong of ['launchId', 'objectiveId'] as const)
  test(`typed publication with wrong root ${wrong} cannot be admitted`, async ({ page }, info) => {
    const r = await page.evaluate(async wrong => {
      const f = window.canonicalReturnObjective; await f.boot(); const bound = await f.publish();
      const ids = { ...bound.goal, [wrong]: crypto.randomUUID() }, before = await f.dump();
      const result = await f.refusal(() => f.admit(bound.ref, ids.launchId, ids.objectiveId));
      return { bound, before, result, after: await f.dump(), state: await f.nativeState() };
    }, wrong);
    expect(r.result).toMatchObject({ rejected: true, message: expect.stringContaining('launch return objective binding changed') });
    expect(r.after).toBe(r.before); expect(r.state.operations).toEqual([]);
    expect(r.state.head.allocations).toEqual({});
    await evidence(info, `wrong-root-${wrong}-admission.json`, r);
  });

test('typed renewal is refused without replacing the original root selection', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalReturnObjective; await f.boot();
    const initial = await f.prepare(), grant = await f.grant();
    const goal = initial.proof.publication.objective!;
    const typed = await f.publish({ launchId: goal.launchId, objectiveId: goal.objectiveId, questId: goal.quest.questId });
    const before = await f.dump(), refused = await f.refusal(() => f.renew(typed.ref)), after = await f.dump();
    return { initial, grant, typed, before, refused, after, selected: await f.rootObjective(initial.prepared.publication) };
  });
  expect(r.refused).toMatchObject({ rejected: true, message: expect.stringMatching(/initial|typed|objective/) });
  expect(r.after).toBe(r.before);
  expect(r.selected.objective).toEqual({ publication: r.initial.prepared.publication, value: r.initial.proof.publication.objective,
    admissionAttemptId: r.initial.launch!.guard.admissionAttemptId });
  await evidence(info, 'typed-renewal-refused.json', r);
});

test('ordinary renewal keeps the typed objective from the original root publication', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalReturnObjective; await f.boot();
    const initial = await f.prepare(), grant = await f.grant();
    const ordinary = await f.publish(f.choice(), false, true), renewed = await f.renew(ordinary.ref);
    const before = await f.dump(), domain = await f.domainState(), selected = await f.rootObjective(ordinary.ref);
    return { initial, grant, ordinary, renewed, before, after: await f.dump(), domain, selected, afterDomain: await f.domainState() };
  });
  expect(r.ordinary.proof.publication.objective).toBeUndefined();
  expect(r.selected.publication.sourceAttemptId).toBe(r.ordinary.original.attemptId);
  expect(r.selected.objective).toEqual({ publication: r.initial.prepared.publication, value: r.initial.proof.publication.objective,
    admissionAttemptId: r.initial.launch!.guard.admissionAttemptId });
  expect(r.after).toBe(r.before);
  expect(r.afterDomain).toEqual(r.domain);
  await evidence(info, 'initial-only-binding-ordinary-renewal.json', r);
});
