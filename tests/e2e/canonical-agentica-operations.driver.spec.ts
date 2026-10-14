import { test, expect } from './canonical-agentica-operations.test';
import type { AgenticaOperationEntry, HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';

test('simultaneous operation drivers leave one owner and a usable shared queue', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot();
    const attempts = await Promise.allSettled([f.attachDriver(s.action, s.binding), f.attachDriver(s.action, s.binding)]);
    return { s, outcomes: attempts.map(r => r.status === 'fulfilled' ? 'attached' : String(r.reason)) };
  });
  expect(result.outcomes.filter(o => o === 'attached')).toHaveLength(1);
  expect(result.outcomes.some(o => o.includes('already attached'))).toBe(true);
  await page.route('**/api/operations?*', route => route.fulfill({ json: [result.s.entry] }));
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'confirmed' });
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.driverStatus())).toEqual({ controlled: true, recoveryRequired: false });
});

test('actual GameSession driver waits for service custody, advances, serializes exact delivery and handles lost ACK', async ({ page }) => {
  const seeded = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.attachDriver(s.action, s.binding); return s;
  });
  let entries: AgenticaOperationEntry[] = [], loseAck = true;
  const delivered: HostOperationEvent[] = [];
  await page.route('**/api/operations?*', route => route.fulfill({ json: entries }));
  await page.route('**/api/operations/events', route => {
    const event = route.request().postDataJSON() as HostOperationEvent; delivered.push(event);
    entries = [{ ...seeded.entry, latestEvent: event }];
    if (event.sequence > 1 && loseAck) { loseAck = false; return route.abort('failed'); }
    return route.fulfill({ json: entries[0] });
  });
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'awaiting-service' });
  expect((await page.evaluate(() => window.canonicalAgenticaOperations.readCanonicalHead())).head.checkpoint).toHaveProperty('position', seeded.actor);
  entries = [seeded.entry];
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'confirmed' });
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'custody-confirmed' });
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'advanced', sequence: 1 });
  const first = (await page.evaluate(action => window.canonicalAgenticaOperations.read(action), seeded.action)).value!;
  expect(first.progress.steps).toBe(1);
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver().catch(String))).toContain('fetch');
  const lost = (await page.evaluate(action => window.canonicalAgenticaOperations.read(action), seeded.action)).value!;
  expect(lost.progress).toEqual(first.progress); expect(lost.acknowledgement).toBeNull();
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'acknowledged', sequence: 2 });
  expect(delivered).toEqual([first.confirmation.data.probe, first.event!.data.event, first.event!.data.event]);
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'advanced', sequence: 2 });
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'acknowledged', sequence: 3 });
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'advanced', sequence: 3 });
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'locally-settled', progress: 'arrived' });
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toMatchObject({ status: 'decision-required', event: { kind: 'decision' } });
  const arrived = (await page.evaluate(action => window.canonicalAgenticaOperations.read(action), seeded.action)).value!;
  expect(arrived.progress.position).toEqual(seeded.target); expect(arrived.operation.state).toBe('settled');
  expect(delivered.map(e => e.sequence)).toEqual([1, 2, 2, 3]);
});

test('HTTP success without exact custody ACK cannot release any movement', async ({ page }) => {
  const seeded = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.attachDriver(s.action, s.binding); return s;
  });
  await page.route('**/api/operations?*', route => route.fulfill({ json: [seeded.entry] }));
  await page.route('**/api/operations/events', route => route.fulfill({ json: {} }));
  await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver());
  const before = (await page.evaluate(action => window.canonicalAgenticaOperations.read(action), seeded.action)).value!;
  expect(typeof await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver().catch(String))).toBe('string');
  const after = (await page.evaluate(action => window.canonicalAgenticaOperations.read(action), seeded.action)).value!;
  expect(after.progress).toEqual(before.progress); expect(after.progress.steps).toBe(0); expect(after.custodyAck).toBeNull();
});

test('parked inventory with unresolved service custody keeps zero steps until the exact probe is accepted', async ({ page }) => {
  const seeded = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.attachDriver(s.action, s.binding); return s;
  });
  let resolved = false; const probes: HostOperationEvent[] = [];
  await page.route('**/api/operations?*', route => route.fulfill({ json: [seeded.entry] }));
  await page.route('**/api/operations/events', route => {
    const event = route.request().postDataJSON() as HostOperationEvent; probes.push(event);
    return resolved ? route.fulfill({ json: { ...seeded.entry, latestEvent: event } })
      : route.fulfill({ status: 409, json: { code: 'session.unresolved', message: 'Original action custody is unresolved.' } });
  });
  await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver());
  const before = await page.evaluate(() => window.canonicalAgenticaOperations.readCanonicalHead());
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver().catch(String))).toContain('unresolved');
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.readCanonicalHead())).toEqual(before);
  const pending = (await page.evaluate(a => window.canonicalAgenticaOperations.read(a), seeded.action)).value!;
  expect(pending.progress.steps).toBe(0); expect(pending.custodyAck).toBeNull();
  expect(probes[0].observation).toEqual(seeded.entry.admission!.observation);
  resolved = true;
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'custody-confirmed' });
  expect(probes).toEqual([pending.confirmation.data.probe, pending.confirmation.data.probe]);
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'advanced', sequence: 1 });
});

test('lost custody ACK retries the retained probe after driver replacement without moving first', async ({ page }) => {
  const seeded = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.attachDriver(s.action, s.binding); return s;
  });
  const probes: HostOperationEvent[] = [];
  await page.route('**/api/operations?*', route => route.fulfill({ json: [seeded.entry] }));
  await page.route('**/api/operations/events', route => {
    const event = route.request().postDataJSON() as HostOperationEvent; probes.push(event);
    return probes.length === 1 ? route.abort('failed') : route.fulfill({ json: { ...seeded.entry, latestEvent: event } });
  });
  await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver());
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver().catch(String))).toContain('fetch');
  const before = (await page.evaluate(a => window.canonicalAgenticaOperations.read(a), seeded.action)).value!;
  expect(before.progress.steps).toBe(0); expect(before.custodyAck).toBeNull();
  await page.evaluate(async s => { const f = window.canonicalAgenticaOperations; f.closeDriver(); await f.attachDriver(s.action, s.binding); }, seeded);
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'custody-confirmed' });
  expect(probes).toEqual([before.confirmation.data.probe, before.confirmation.data.probe]);
  const after = (await page.evaluate(a => window.canonicalAgenticaOperations.read(a), seeded.action)).value!;
  expect(after.progress).toEqual(before.progress);
});

test('new session can reconcile pending event but cannot silently adopt movement', async ({ page }) => {
  const seeded = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.attachDriver(s.action, s.binding); return s;
  });
  await page.route('**/api/operations?*', route => route.fulfill({ json: [seeded.entry] }));
  await page.route('**/api/operations/events', route => route.fulfill({ json: { ...seeded.entry, latestEvent: route.request().postDataJSON() } }));
  await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations; await f.pulseDriver(); await f.pulseDriver(); await f.pulseDriver(); f.stop();
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAgenticaOperations);
  await page.evaluate(async s => { const f = window.canonicalAgenticaOperations; await f.resume(); await f.attachDriver(s.action, s.binding); }, seeded);
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver())).toEqual({ status: 'acknowledged', sequence: 2 });
  const before = (await page.evaluate(action => window.canonicalAgenticaOperations.read(action), seeded.action)).value!;
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver().catch(String))).toContain('adoption');
  const after = (await page.evaluate(action => window.canonicalAgenticaOperations.read(action), seeded.action)).value!;
  expect(after.progress).toEqual(before.progress);
});
