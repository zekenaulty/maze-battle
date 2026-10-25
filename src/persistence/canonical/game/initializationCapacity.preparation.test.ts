// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preparationCapacity } from '../world/preparationCapacity';
import { preparationMemory, type PreparationMeasurement } from '../world/preparationCapacity.test-support';
import { isPublicBirth, measureBirth } from './initializationCapacity.test-support';

const selectedFloors = [1, 2, 16], costs = ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const;
const total = (rows: PreparationMeasurement[], field: typeof costs[number]) => rows.reduce((n, r) => n + r[field], 0);

it.each([42, 781])('bounds preparation after actual default public birth, seed %s', async seed => {
  const birth = await measureBirth('split', seed, false), publicRows = birth.complete.records.filter(isPublicBirth);
  const harness = (staged: typeof birth.complete) => preparationMemory(seed, { ...staged,
    head: { ...birth.current, revision: birth.current.revision + 1, roots: staged.roots }, worldId: birth.recipe.worldId });
  const populated = harness(birth.complete), baseline = harness(birth.baseline), phases: unknown[] = [];
  const directory = resolve('test-results/initialization-capacity-populated'); mkdirSync(directory, { recursive: true });
  const evidence = { seed, selectedFloors, birth: { publicRows, populatedRoot: birth.complete.roots.world,
    baselineRoot: birth.baseline.roots.world }, phases, populated: populated.measurements, baseline: baseline.measurements };
  const retain = () => writeFileSync(resolve(directory, `seed-${seed}.json`), JSON.stringify(evidence, null, 2));
  async function readPublic() {
    return populated.read(async pages => {
      const rows = [];
      for (const row of publicRows) rows.push(await pages.get('world', row.key));
      const items = await pages.scan('world', 'roster/items/pack/', undefined, 4);
      return { rows, items, witness: await pages.witness('world', 'roster/') };
    });
  }
  const originalPublic = await readPublic();
  expect(originalPublic.rows).toEqual(publicRows); expect(originalPublic.items.rows).toHaveLength(3);
  expect(originalPublic.items.next).toBeUndefined(); expect(originalPublic.witness).not.toBeNull();
  try {
    for (let level = 1; level <= 16; level++) {
      const { version, roomBudget, policy, spatial } = await populated.floor(level);
      await baseline.floor(level);
      if (!selectedFloors.includes(level)) continue;
      const cap = preparationCapacity({ version, level, roomBudget, policy, ...(spatial ? { spatial } : {}) });
      for (const [phase, bound] of Object.entries(cap.phases)) {
        // Birth itself is separately qualified by initializationCapacity.writer.test.
        if (level === 1 && phase === 'bootstrap') continue;
        const actual = populated.measurements.filter(m => m.level === level && m.phase === phase);
        const bare = baseline.measurements.filter(m => m.level === level && m.phase === phase);
        const measured = Object.fromEntries(costs.map(k => [k, total(actual, k)]));
        const before = Object.fromEntries(costs.map(k => [k, total(bare, k)]));
        phases.push({ level, phase, calls: actual.length, actual: measured, baseline: before, bound,
          nodeDeltaBytes: measured.nodesBytes - before.nodesBytes });
        retain(); // Keep exact per-call/phase costs even when a bound assertion fails.
        expect(actual.length, `${level}/${phase}/calls`).toBe(bound.calls);
        for (const field of costs) expect(total(actual, field), `${seed}/${level}/${phase}/${field}`).toBeLessThanOrEqual(bound[field]);
        expect(actual.map(m => m.values)).toEqual(bare.map(m => m.values));
        expect(actual.every(m => !m.values.some(v => v.key.startsWith('roster/') || v.key === 'game/settings'))).toBe(true);
        expect(actual.some(m => m.nodePrefixes!.some(p => p === '' || p === 'record/'))).toBe(true);
      }
      expect(await readPublic(), `floor ${level} retained public identities/indexes/subtree`).toEqual(originalPublic);
    }
    expect(phases).toHaveLength(14);
    console.info(JSON.stringify({ seed, phases }));
  } finally { retain(); }
}, 120_000);
