import { test, expect, readOnly } from './canonical-recovery-discovery.test';

test('first claim creates the active-root locator atomically without a successor grant', async ({ page }) => {
  const seed = await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.boot({ claim: false, cancel: false }));
  const before = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(before);
  expect(before.value!.claimed).toBeNull(); expect(before.value!.selected!.predecessor).toBeNull();
  await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.claim());
  const listed = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(listed);
  expect(listed.value!.claimed).toEqual(listed.value!.allocations.find(row => row.navigation)!.navigation);
  expect(listed.value!.claimed!.binding).toEqual(seed!.binding); expect(listed.value!.selected!.predecessor).toBeNull();
  const pointer = await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.locator());
  const detail = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate),
    { fence: listed.value!.fence, candidate: listed.value!.claimed! }); readOnly(detail);
  expect(detail.value!.claim!.data.locatorId).toBe(pointer.id);
  expect(detail.value!.claim!.source.attemptId).toBe((pointer.value as { sourceAttemptId: string }).sourceAttemptId);
});

for (const rootFirst of [false, true]) for (const crossEpoch of [false, true])
test(`both ACKs preserve pregrant candidate after reload (rootFirst=${rootFirst}, crossEpoch=${crossEpoch})`, async ({ page }) => {
  const seed = await page.evaluate(crossEpoch => window.canonicalRecoveryDiscovery.claimedRecovery.boot({ crossEpoch }), crossEpoch);
  const first = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!;
  await page.evaluate(rootFirst => window.canonicalRecoveryDiscovery.claimedRecovery.acknowledge(rootFirst), rootFirst);
  await page.evaluate(() => window.canonicalRecoveryDiscovery.quota());
  const listed = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(listed);
  const saved = { fence: listed.value!.fence, candidate: listed.value!.claimed! };
  expect(saved.candidate).toEqual(first.claimed); expect(listed.value!.allocations).toEqual([]);
  expect(listed.value!.active!.state).toBe('acknowledged'); expect(listed.value!.selected!.predecessor).toBeNull();
  await page.reload(); await page.waitForFunction(() => !!window.canonicalRecoveryDiscovery);
  const reloaded = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(reloaded);
  expect(reloaded.value!.claimed).toEqual(saved.candidate);
  const detail = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate), saved); readOnly(detail);
  expect(detail.value!.operation.state).toBe('acknowledged'); expect(detail.value!.action).toEqual(seed!.action);
  expect(detail.value!.claim).not.toBeNull(); expect(detail.value!.acknowledgement).not.toBeNull();
  expect(detail.value!.stats.reads).toBeLessThan(2048); expect(reloaded.value!.stats.reads).toBeLessThan(2048);
});

test('failed claim write rolls back its staged locator', async ({ page }) => {
  await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.boot({ claim: false, cancel: false }));
  const before = await page.evaluate(() => window.canonicalRecoveryDiscovery.dump());
  const failure = await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.failClaim());
  expect(failure.staged).toBe(true); expect(failure.error).toContain('Injected claim write failure');
  expect(await page.evaluate(() => window.canonicalRecoveryDiscovery.dump())).toBe(before);
  const listed = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(listed);
  expect(listed.value!.claimed).toBeNull();
});

for (const kind of ['root', 'source', 'revision', 'original', 'binding', 'claim', 'claim-source', 'root-source'] as const)
  test(`claimed locator fails closed on damaged ${kind}`, async ({ page }) => {
    await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.boot());
    await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.acknowledge());
    const listed = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!;
    await page.evaluate(kind => window.canonicalRecoveryDiscovery.claimedRecovery.corrupt(kind), kind);
    const bad = await page.evaluate(() => window.canonicalRecoveryDiscovery.list());
    expect(bad.error).toBeTruthy(); expect(bad.unchanged).toBe(true); expect(bad.modes.every(mode => mode === 'readonly')).toBe(true);
    const inspected = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate),
      { fence: listed.fence, candidate: listed.claimed! });
    expect(inspected.error).toBeTruthy(); expect(inspected.unchanged).toBe(true);
  });

for (const replacement of ['reset', 'newRoot'] as const) test(`${replacement} does not discover or inspect an old claimed root`, async ({ page }) => {
  await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.boot());
  await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.acknowledge());
  const old = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!, candidate = old.claimed!;
  const pointer = await page.evaluate(() => window.canonicalRecoveryDiscovery.claimedRecovery.locator());
  await page.evaluate(async replacement => { await window.canonicalRecoveryDiscovery.claimedRecovery[replacement](); }, replacement);
  const listed = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(listed);
  expect(listed.value!.claimed).toBeNull(); expect(listed.keys).not.toContain(pointer.key);
  expect(listed.keys).not.toContain(candidate.original.key);
  const inspected = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate),
    { fence: listed.value!.fence, candidate });
  expect(inspected.error).toBeTruthy(); expect(inspected.unchanged).toBe(true);
});

test('new claims advance exactly once and older claim replay cannot rewind the locator', async ({ page }) => {
  const first = await page.evaluate(() => window.canonicalRecoveryDiscovery.boot('acknowledged'));
  const old = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!.claimed!;
  await page.evaluate(() => window.canonicalRecoveryDiscovery.nextWindow());
  const latest = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(latest);
  expect(latest.value!.claimed).toEqual(latest.value!.selected!.predecessor); expect(latest.value!.claimed).not.toEqual(old);
  await page.evaluate(action => window.canonicalRecoveryDiscovery.replayClaim(action), first!.action);
  const replay = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(replay);
  expect(replay.value!.claimed).toEqual(latest.value!.claimed);
  const inspected = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate),
    { fence: replay.value!.fence, candidate: old });
  expect(inspected.error).toContain('no longer listed'); expect(inspected.unchanged).toBe(true);
});
