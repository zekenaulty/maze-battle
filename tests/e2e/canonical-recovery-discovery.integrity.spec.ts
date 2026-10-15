import { test, expect } from './canonical-recovery-discovery.test';

for (const legacy of [false, true]) test(`does not create or upgrade schema (legacy=${legacy})`, async ({ page }) => {
  const result = await page.evaluate(legacy => window.canonicalRecoveryDiscovery.unchangedSchema(legacy), legacy);
  expect(result.error).toContain('existing current canonical database'); expect(result.writes).toEqual([]);
  expect(result.after).toEqual(result.before); if (legacy) expect(result.sentinel).toBe('preserve');
});

test('rejects a competing head write between inventory reads', async ({ page }) => {
  await page.evaluate(() => window.canonicalRecoveryDiscovery.boot());
  const result = await page.evaluate(() => window.canonicalRecoveryDiscovery.inventoryRace());
  expect(result.injected).toBe(true); expect(result.error).toContain('inventory fence changed');
});

for (const kind of ['reserve', 'original', 'changed-original', 'ack', 'selection'] as const) test(`fails closed on damaged ${kind} evidence`, async ({ page }) => {
  await page.evaluate(() => window.canonicalRecoveryDiscovery.boot('acknowledged'));
  const inventory = (await page.evaluate(() => window.canonicalRecoveryDiscovery.list())).value!, candidate = inventory.selected!.predecessor!;
  await page.evaluate(({ candidate, kind }) => window.canonicalRecoveryDiscovery.corrupt(candidate, kind), { candidate, kind });
  const inspected = await page.evaluate(({ fence, candidate }) => window.canonicalRecoveryDiscovery.inspect(fence, candidate), { fence: inventory.fence, candidate });
  expect(inspected.error).toBeTruthy(); expect(inspected.unchanged).toBe(true);
  expect(inspected.modes.every(mode => mode === 'readonly')).toBe(true);
  const listed = await page.evaluate(() => window.canonicalRecoveryDiscovery.list());
  // Inventory exposes only a predecessor locator, not its historical ACK status.
  if (kind !== 'ack') expect(listed.error).toBeTruthy();
  expect(listed.unchanged).toBe(true);
});
