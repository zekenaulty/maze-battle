import { test, expect } from '@playwright/test';
import { attach, audit, comparable, isolated, local, move, retain, retained, sample, state, witness } from './canonical-generated-endurance.support';
import { pagedRecall, comparablePages } from './canonical-generated-endurance.paging';

for (const seed of [42, 781]) test(`generated seed ${seed}: actual App local I/O with 1, 8 and 16 retained floors`, async ({ page, context }, info) => {
  const evidence: Record<string, unknown> = { seed, setup: 'retainFloors bypasses stair journeys while App is unmounted; measured movement is earned-only on floor 1' };
  const samples: { depth: number; key: string; result: Awaited<ReturnType<typeof sample>> }[] = [];
  evidence.samples = samples;
  const pages: { depth: number; result: Awaited<ReturnType<typeof pagedRecall>> }[] = [];
  evidence.pages = pages;
  try {
    const boot = await isolated(context, page, seed); evidence.boot = boot;
    let old: Awaited<ReturnType<typeof witness>> | undefined;
    let first: { keys: string[]; position: Awaited<ReturnType<typeof state>>['checkpoint']['position'] } | undefined;
    for (const depth of [1, 8, 16]) {
      const setup = await retain(page, depth); evidence[`depth-${depth}`] = await audit(page);
      const edge = { keys: setup.keys, position: (await state(page)).checkpoint.position };
      if (first) expect(edge).toEqual(first); else { first = edge; evidence.edge = edge; }
      if (!old) { old = await witness(page, setup.route[0]); await move(page, setup.route[1]); evidence.old = old; }
      for (const key of setup.keys) {
        const result = await sample(page, key, info, `depth-${depth}-${key}`); samples.push({ depth, key, result }); local(result.native);
      }
      if (depth > 1) {
        comparable(samples[0].result.native, samples.at(-2)!.result.native);
        comparable(samples[1].result.native, samples.at(-1)!.result.native);
      }
      const result = await pagedRecall(page, info, `depth-${depth}`, pages[0]?.result.selected);
      pages.push({ depth, result });
      if (depth > 1) comparablePages(pages[0].result, result);
      evidence[`retained-${depth}`] = await retained(page, old);
    }
    expect(samples).toHaveLength(6); expect(pages).toHaveLength(3);
    expect(boot.unexpected).toEqual([]); expect(boot.errors).toEqual([]);
  } finally { await attach(info, 'generated-depth.json', evidence); }
});
