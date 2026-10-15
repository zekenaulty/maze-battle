import { test, expect, readOnly } from './canonical-recovery-discovery.test';

test('never initializes a missing game', async ({ page }) => {
  const result = await page.evaluate(() => window.canonicalRecoveryDiscovery.list());
  expect(result.error).toContain('game has not been initialized'); expect(result.unchanged).toBe(true);
  expect(result.modes.every(mode => mode === 'readonly')).toBe(true);
});

test('empty allocations never certify session clear', async ({ page }) => {
  await page.evaluate(() => window.canonicalRecoveryDiscovery.boot('empty'));
  const empty = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(empty);
  expect(empty.value).toMatchObject({ active: null, selected: null, allocations: [], sessionClear: 'unknown', pendingRemoteActions: 'unknown' });
});

test('pending-only reserve remains unknown and does not fabricate navigation', async ({ page }) => {
  await page.evaluate(async () => { const f = window.canonicalRecoveryDiscovery; await f.boot('funded'); await f.reserveOnly(); });
  const result = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(result);
  expect(result.value!.allocations).toHaveLength(1); expect(result.value!.allocations[0].navigation).toBeNull();
  expect(result.value).toMatchObject({ sessionClear: 'unknown', pendingRemoteActions: 'unknown' });
});

test('lists exactly the local allocation bound and inspects original action and binding at quota', async ({ page }) => {
  const seed = await page.evaluate(() => window.canonicalRecoveryDiscovery.boot());
  await page.evaluate(async () => { await window.canonicalRecoveryDiscovery.fillAllocations(); await window.canonicalRecoveryDiscovery.quota(); });
  const result = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(result);
  const inventory = result.value!, candidates = inventory.allocations.filter(row => row.navigation);
  expect(inventory.allocations).toHaveLength(16); expect(candidates).toHaveLength(1);
  expect(candidates[0].navigation!.binding).toEqual(seed!.binding);
  const detail = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate),
    { fence: inventory.fence, candidate: candidates[0].navigation! }); readOnly(detail);
  expect(detail.value!.action).toEqual(seed!.action); expect(detail.value!.candidate.binding).toEqual(seed!.binding);
  expect(detail.value!.operation.id).toBe(seed!.operationId); expect(detail.value!.decision).toBeNull();
  expect(inventory.stats.reads).toBeLessThan(2048); expect(detail.value!.stats.reads).toBeLessThan(2048);
});

test('selected successor predecessor retains the old pair and validates historical ACK after reload', async ({ page }) => {
  const seed = await page.evaluate(() => window.canonicalRecoveryDiscovery.boot('acknowledged'));
  const first = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(first);
  expect(first.value!.allocations).toHaveLength(1);
  expect(first.value!.selected!.binding.grant).not.toEqual(seed!.binding.grant);
  expect(first.value!.selected!.predecessor!.binding).toEqual(seed!.binding);
  const saved = { fence: first.value!.fence, candidate: first.value!.selected!.predecessor! };
  const before = await page.evaluate(() => window.canonicalRecoveryDiscovery.dump());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalRecoveryDiscovery);
  const detail = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate), saved); readOnly(detail);
  expect(detail.value!.operation.state).toBe('acknowledged'); expect(detail.value!.acknowledgement!.source.operation).toBe('operation.acknowledge');
  expect(detail.value!.decision).not.toBeNull(); expect(detail.value!.claim).not.toBeNull(); expect(detail.value!.candidate.binding).toEqual(seed!.binding);
  expect(await page.evaluate(() => window.canonicalRecoveryDiscovery.dump())).toBe(before);
});

for (const change of ['revision', 'owner'] as const) test(`rejects stale ${change} fence without rewriting old intent`, async ({ page }) => {
  await page.evaluate(() => window.canonicalRecoveryDiscovery.boot('decision'));
  const original = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!;
  const candidate = original.allocations.find(row => row.navigation)!.navigation!;
  await page.evaluate(async change => {
    if (change === 'revision') await window.canonicalRecoveryDiscovery.changeHead();
    else await window.canonicalRecoveryDiscovery.takeover();
  }, change);
  const stale = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate), { fence: original.fence, candidate });
  expect(stale.error).toContain('fence changed'); expect(stale.unchanged).toBe(true);
  const current = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!;
  const detail = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate), { fence: current.fence, candidate }); readOnly(detail);
  expect(detail.value!.decision!.source.expected.owner).toBe(original.fence.owner);
  expect(detail.value!.decision!.source.expected.epoch).toBe(original.fence.epoch);
});

for (const changed of ['binding', 'original', 'operation'] as const) test(`rejects changed exact ${changed}`, async ({ page }) => {
  await page.evaluate(() => window.canonicalRecoveryDiscovery.boot('successor'));
  const inventory = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!, candidate = inventory.selected!.predecessor!;
  if (changed === 'binding') candidate.binding = inventory.selected!.binding;
  if (changed === 'original') candidate.original.id = 'different-original';
  if (changed === 'operation') candidate.operationId = 'different-operation';
  const result = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate), { fence: inventory.fence, candidate });
  expect(result.error).toBeTruthy(); expect(result.unchanged).toBe(true);
});

test('owns captured input across awaits', async ({ page }) => {
  await page.evaluate(() => window.canonicalRecoveryDiscovery.boot());
  const inventory = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!, candidate = inventory.allocations.find(row => row.navigation)!.navigation!;
  const result = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspectCaptured(fence, candidate), { fence: inventory.fence, candidate });
  readOnly(result); expect(result.value!.candidate).toEqual(candidate); expect(result.value!.fence).toEqual(inventory.fence);
});

test('inventory and single inspection do not walk older successor ancestry', async ({ page }) => {
  await page.evaluate(() => window.canonicalRecoveryDiscovery.boot('acknowledged'));
  const first = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!.selected!.predecessor!.original.key;
  const costs: { inventory: number; inspection: number }[] = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.canonicalRecoveryDiscovery.nextWindow());
    const listed = await page.evaluate(() => window.canonicalRecoveryDiscovery.list()); readOnly(listed);
    const inventory = listed.value!, candidate = inventory.selected!.predecessor!;
    expect(inventory.allocations).toHaveLength(1);
    const inspected = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate), { fence: inventory.fence, candidate });
    readOnly(inspected); expect(inspected.value!.operation.state).toBe('acknowledged');
    expect(inventory.stats.reads).toBeLessThan(2048); expect(inspected.value!.stats.reads).toBeLessThan(2048);
    if (i > 0) { expect(listed.keys).not.toContain(first); expect(inspected.keys).not.toContain(first); }
    costs.push({ inventory: listed.keys.length, inspection: inspected.keys.length });
  }
  expect(costs[2]).toEqual(costs[1]);
});
