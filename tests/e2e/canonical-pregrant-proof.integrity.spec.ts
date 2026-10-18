import { test, expect } from './canonical-pregrant-proof.test';

test('an absent database remains absent', async ({ page }) => {
  const before = await page.evaluate(() => window.canonicalPregrantProof.databases());
  await expect(page.evaluate(() => window.canonicalPregrantProof.absent())).rejects.toThrow('existing current canonical database');
  expect(await page.evaluate(() => window.canonicalPregrantProof.databases())).toEqual(before);
});

for (const legacy of [false, true]) test(`HTTP composition cannot ${legacy ? 'upgrade obsolete' : 'create absent'} canonical storage`, async ({ page }) => {
  const result = await page.evaluate(legacy => window.canonicalPregrantProof.schemaRecovery(legacy), legacy);
  expect(result.error).toContain('existing current canonical database');
  expect(result.before).toEqual(result.after); expect(result.writes).toEqual([]);
  expect(result.sentinel).toBe(legacy ? 'preserve' : null);
});

for (const [name, options, error] of [
  ['uncancelled guard', { cancel: false }, 'cancellation'],
  ['missing correlated claim', { claim: false }, 'correlated claim'],
  ['existing successor grant', { grant: true }, 'was granted'],
] as const) test(`${name} is not a pregrant no-effect proof`, async ({ page }) => {
  await page.evaluate(options => window.canonicalPregrantProof.boot(options), options);
  const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
  await expect(page.evaluate(() => window.canonicalPregrantProof.prove())).rejects.toThrow(error);
  expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
});

test('changed action scope, manifest, capability or revision refuses without falling back', async ({ page }) => {
  const { pending } = await page.evaluate(() => window.canonicalPregrantProof.boot());
  const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
  for (const patch of [{ runId: 'foreign-run' }, { sessionId: 'foreign-session' }, { sessionEpoch: '999' },
    { manifestHash: `sha256:${(pending.manifestHash.endsWith('a') ? 'b' : 'a').repeat(64)}` },
    { capabilityId: 'foreign-capability' }, { expectedRevision: pending.expectedRevision + 1 }])
    await expect(page.evaluate(action => window.canonicalPregrantProof.prove(action), { ...pending, ...patch })).rejects.toThrow('binding changed');
  await expect(page.evaluate(() => window.canonicalPregrantProof.wrongParent())).rejects.toThrow();
  await expect(page.evaluate(() => window.canonicalPregrantProof.wrongBinding())).rejects.toThrow();
  expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
});

test('stale owner/revision and aborted caller cannot obtain a fresh proof', async ({ page }) => {
  await page.evaluate(() => window.canonicalPregrantProof.boot());
  const fence = await page.evaluate(() => window.canonicalPregrantProof.fence());
  await page.evaluate(() => window.canonicalPregrantProof.advanceRevision());
  const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
  await expect(page.evaluate(f => window.canonicalPregrantProof.prove(undefined, f), fence)).rejects.toThrow('owner or revision changed');
  const current = await page.evaluate(() => window.canonicalPregrantProof.fence());
  await expect(page.evaluate(f => window.canonicalPregrantProof.prove(undefined, f), { ...current, owner: 'foreign-owner' })).rejects.toThrow('owner or revision changed');
  await expect(page.evaluate(() => window.canonicalPregrantProof.aborted())).rejects.toThrow();
  expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
});

test('deleted successor grant still named by selection fails closed', async ({ page }) => {
  await page.evaluate(() => window.canonicalPregrantProof.boot({ grant: true }));
  await page.evaluate(() => window.canonicalPregrantProof.corrupt('selected-grant'));
  const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
  await expect(page.evaluate(() => window.canonicalPregrantProof.prove())).rejects.toThrow('missing run grant');
  expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
});

test('historical root ACK corruption refuses rather than relying on its terminal flag', async ({ page }) => {
  await page.evaluate(() => window.canonicalPregrantProof.boot());
  await page.evaluate(() => window.canonicalPregrantProof.acknowledgeRoot());
  await page.evaluate(() => window.canonicalPregrantProof.corrupt('root-ack'));
  const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
  await expect(page.evaluate(() => window.canonicalPregrantProof.prove())).rejects.toThrow();
  expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
});

for (const kind of ['claim', 'intent', 'cancel', 'publication', 'parent', 'pending', 'result'] as const)
  test(`missing/corrupt ${kind} evidence is never interpreted as no execution`, async ({ page }) => {
    await page.evaluate(() => window.canonicalPregrantProof.boot());
    await page.evaluate(kind => window.canonicalPregrantProof.corrupt(kind), kind);
    const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
    await expect(page.evaluate(() => window.canonicalPregrantProof.prove())).rejects.toThrow();
    expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
  });
