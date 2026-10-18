import { test, expect } from './canonical-agentica-operations.test';
import { bootDriver, cancel, fillQuota, peer, pulse } from './canonical-agentica-operations.terminal-support';

for (const first of ['root', 'navigation']) for (const quota of [false, true]) {
  test(`reset needs both exact root/navigation ACKs (${first} first, quota ${quota})`, async ({ page }) => {
    const s = await bootDriver(page); await peer(page, s.entry);
    if (quota) {
      await fillQuota(page);
      const error = await page.evaluate(async () => {
        const f = window.canonicalAgenticaOperations;
        return f.executeCanonical(await f.command('fixture.full', {}), async () => null).then(() => '', String);
      });
      expect(error).toContain('storage quota exhausted');
    }
    const attempt = () => page.evaluate(async () => {
      const path = '/src/persistence/canonical/lifecycle.ts';
      const { resetCanonical } = await import(/* @vite-ignore */ path) as typeof import('../../src/persistence/canonical/lifecycle');
      const f = window.canonicalAgenticaOperations, before = await f.dump();
      const error = await resetCanonical('replacement', {}).then(() => '', String);
      return { error, unchanged: before === await f.dump(), head: (await f.readCanonicalHead()).head };
    });
    const admitted = await attempt(); expect(admitted.error).toContain('unresolved verified-host obligation'); expect(admitted.unchanged).toBe(true);
    await cancel(page);
    const settled = await attempt(); expect(settled.error).toContain('unresolved verified-host obligation'); expect(settled.unchanged).toBe(true);
    const rootAck = () => page.evaluate(() => window.canonicalAgenticaOperations.launchAck());
    const navigationAck = async () => expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'cancelled' });
    await (first === 'root' ? rootAck() : navigationAck());
    const partial = await attempt(); expect(partial.error).toContain('unresolved verified-host obligation'); expect(partial.unchanged).toBe(true);
    expect(Object.keys(partial.head.allocations)).toEqual([first === 'root' ? s.operationId : s.launchGuard]);
    await (first === 'root' ? navigationAck() : rootAck());
    const final = await attempt(); expect(final.error).toBe(''); expect(final.head.allocations).toEqual({});
    expect(final.head.generation).not.toBe(admitted.head.generation);
  });
}
