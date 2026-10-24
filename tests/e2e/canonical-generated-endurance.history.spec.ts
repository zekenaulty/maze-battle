import { test, expect } from '@playwright/test';
import { attach, audit, comparable, diagnostic, isolated, local, move, ready, retain, retained, sample, state, witness } from './canonical-generated-endurance.support';

for (const seed of [42, 781]) test(`generated seed ${seed}: fixed-depth 1024 actual App movement commands retain original history`, async ({ page, context }, info) => {
  const evidence: Record<string, unknown> = { seed, depth: 1, historyTarget: 1024, setup: 'unmounted retained-floor fixture; no teleport in played phases' };
  const samples: Awaited<ReturnType<typeof sample>>[] = [], history: Awaited<ReturnType<typeof diagnostic>>[] = [];
  evidence.samples = samples; evidence.history = history;
  try {
    const boot = await isolated(context, page, seed); evidence.boot = boot;
    const setup = await retain(page, 1);
    const old = await witness(page, setup.route[0]); await move(page, setup.route[1]);
    evidence.old = old; evidence.initial = await audit(page);
    let completed = 0;
    for (const milestone of [0, 128, 1024]) {
      const before = await audit(page), position = (await state(page)).checkpoint.position;
      for (; completed < milestone; completed++) {
        const beforeStep = await state(page), receipt = await move(page, setup.route[completed % 2]);
        const afterStep = await state(page), work = await diagnostic(page);
        expect(afterStep.checkpoint.position).not.toEqual(beforeStep.checkpoint.position);
        expect(afterStep.checkpoint.knowledge!.sequence).toBe(beforeStep.checkpoint.knowledge!.sequence + 1);
        expect(receipt.afterRevision).toBe(receipt.beforeRevision + 1); expect(work.revision).toBe(receipt.afterRevision);
        expect(work.stats.reads).toBeLessThanOrEqual(2048); expect(work.stats.writes).toBeLessThanOrEqual(512);
        expect(work.stats.readBytes + work.stats.writeBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
        history.push(work);
      }
      await ready(page);
      const after = await audit(page), count = milestone === 1024 ? 896 : milestone;
      expect(after.receipts - before.receipts).toBe(count);
      expect(after.head.revision - before.head.revision).toBe(count);
      expect((await state(page)).checkpoint.position).toEqual(position);
      evidence[`history-${milestone}`] = { before, after };
      for (const key of setup.keys) {
        const result = await sample(page, key, info, `history-${milestone}-${key}`); samples.push(result); local(result.native);
      }
      if (milestone) {
        comparable(samples[0].native, samples.at(-2)!.native);
        comparable(samples[1].native, samples.at(-1)!.native);
      }
      evidence.retention = await retained(page, old);
    }
    expect(history).toHaveLength(1024);
    await page.reload(); await ready(page); evidence.afterReload = await retained(page, old);
    evidence.final = await audit(page);
    expect(boot.unexpected).toEqual([]); expect(boot.errors).toEqual([]);
  } finally { await attach(info, 'generated-history.json', evidence); }
});
