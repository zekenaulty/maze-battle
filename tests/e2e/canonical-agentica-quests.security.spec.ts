import { test, expect, evidence } from './canonical-agentica-quests.test';

test('malformed, tampered, cross-query and foreign-publication handles explicitly refuse without effects', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests; await f.boot();
    const first = await f.list(), token = first.data.quests[0].target;
    if (!first.data.next) throw Error('Need a real continuation token');
    const edit = (field: string, value: unknown) => JSON.stringify({ ...JSON.parse(token), [field]: value });
    const foreign = JSON.parse(token); foreign.publication.id = crypto.randomUUID();
    const wrongAction = JSON.parse(token); wrongAction.action.id = crypto.randomUUID();
    const absent = JSON.parse(token); absent.action.key = `agentica/actions/${'0'.repeat(64)}`;
    const cases = [
      { name: 'malformed-json', args: { scope: 'quest', target: '{' } },
      { name: 'private-id', args: { scope: 'quest', target: 'floor-1:private-origin:private-target:fetch' } },
      { name: 'foreign-publication', args: { scope: 'quest', target: JSON.stringify(foreign) } },
      { name: 'foreign-action-record', args: { scope: 'quest', target: JSON.stringify(wrongAction) } },
      { name: 'absent-action', args: { scope: 'quest', target: JSON.stringify(absent) } },
      { name: 'negative-ordinal', args: { scope: 'quest', target: edit('selection', -1) } },
      { name: 'outside-ordinal', args: { scope: 'quest', target: edit('selection', 4) } },
      { name: 'extra-field', args: { scope: 'quest', target: edit('privateKey', 'quest/private') } },
      { name: 'cursor-as-row', args: { scope: 'quest', target: first.data.next } },
      { name: 'row-as-cursor', args: { scope: 'quests', status: 'active', cursor: token } },
      { name: 'wrong-status', args: { scope: 'quests', status: 'complete', cursor: first.data.next } },
      { name: 'oversized-token', args: { scope: 'quest', target: 'x'.repeat(1025) } },
      { name: 'multibyte-invalid-token', args: { scope: 'quest', target: '\u754c'.repeat(500) } },
    ];
    const before = await f.domainState(), results = [];
    for (const scenario of cases) {
      const original = await f.action(scenario.args), result = await f.dispatch(original);
      results.push({ name: scenario.name, result, proof: await f.retained(original) });
    }
    return { before, first, results, after: await f.domainState() };
  });
  for (const current of r.results) {
    expect(current.result.disposition, current.name).toBe('refused');
    expect(current.result.operation, current.name).toBeUndefined();
    expect(current.proof.value!.result).toEqual(current.result);
    expect(current.proof.proof!.row.value).not.toHaveProperty('query');
    expect(current.result.observation!.data).not.toHaveProperty('quests');
    expect(current.result.observation!.data).not.toHaveProperty('quest');
    expect(current.result.summary).not.toContain('private-origin');
  }
  expect(r.after).toEqual(r.before);
  await evidence(info, 'quest-handle-refusals.json', r);
});

for (const scope of ['quests', 'quest'] as const) test(`an old inspect grant cannot reserve the new ${scope} scope`, async ({ page }, info) => {
  const r = await page.evaluate(async scope => {
    const f = window.canonicalAgenticaQuests, boot = await f.boot({ oldManifest: true });
    const oldAction = await f.action({ scope: 'map' }), oldResult = await f.dispatch(oldAction);
    const original = await f.action(scope === 'quests' ? { scope, status: 'active' } : { scope, target: '{}' });
    const before = await f.dump(), result = await f.refusal(() => f.reserve(original));
    return { boot, oldResult, original, before, result, after: await f.dump(), retained: await f.retained(original) };
  }, scope);
  expect(r.oldResult.disposition).toBe('applied');
  expect(r.boot.start.capabilities).toHaveLength(5);
  const inspect = r.boot.start.capabilities.find(capability => capability.id === 'maze.inspect')!;
  expect(inspect.inputSchema.fields.find(field => field.name === 'scope')!.allowedValues).not.toContain(scope);
  expect(r.result.rejected).toBe(true); expect(r.after).toBe(r.before); expect(r.retained.value).toBeNull();
  await evidence(info, `old-manifest-${scope}-denied.json`, r);
});

test('a valid token with a foreign grant cannot reserve another query', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests, boot = await f.boot(), first = await f.list();
    const original = await f.action({ scope: 'quest', target: first.data.quests[0].target });
    const before = await f.dump(), result = await f.refusal(() => f.reserveWithBinding(original, {
      ...boot.binding, grant: { key: 'agentica/run-grants/foreign', id: crypto.randomUUID() },
    }));
    return { before, result, after: await f.dump(), retained: await f.retained(original) };
  });
  expect(r.result.rejected).toBe(true); expect(r.after).toBe(r.before); expect(r.retained.value).toBeNull();
  await evidence(info, 'foreign-quest-grant-denied.json', r);
});

test('a reserved query cannot refresh from a newer publication state', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests; await f.boot();
    const original = await f.action({ scope: 'quests', status: 'active' }); await f.reserve(original);
    await f.look();
    const before = await f.dump(), domain = await f.domainState(), result = await f.refusal(() => f.perform(original));
    return { before, domain, result, after: await f.dump(), afterDomain: await f.domainState(), retained: await f.retained(original) };
  });
  expect(r.result.rejected).toBe(true); expect(r.result.message).toContain('publication');
  expect(r.after).toBe(r.before); expect(r.afterDomain).toEqual(r.domain); expect(r.retained.value!.result).toBeNull();
  await evidence(info, 'stale-quest-publication-denied.json', r);
});
