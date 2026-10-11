import { createServer } from 'vite';
const budgets = [7, 11, 13, 16, 32, 64, 128, 256];
const seeds = [2, 42];
const fixtures = budgets.flatMap(budget => seeds.map(seed => ({ id: `floor-${budget}-${seed}`, budget, seed })));
const growth = [32, 128].flatMap(budget => [1, 2, 4, 8, 16].map(count => ({ id: `archive-${budget}-${count}`, budget, count })));
const emit = value => console.log(JSON.stringify(value));
emit({ type: 'start', cohort: 'domain', manifest: [...fixtures, ...growth].map(f => f.id) });
const started = performance.now();
const server = await createServer({ configFile: false, cacheDir: 'scripts/d1-measurements/.cache/domain',
  server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { measureFloor, measureArchives } = await server.ssrLoadModule('/scripts/d1-measurements/measure.ts');
  for (const fixture of [...fixtures, ...growth]) {
    if (performance.now() - started > 155000) {
      emit({ type: 'row', row: { ...fixture, status: 'infeasible', reason: 'Cooperative cohort wall budget exhausted' } });
      continue;
    }
    global.gc?.();
    const before = process.memoryUsage();
    const start = performance.now();
    try {
      const row = fixture.count ? measureArchives(fixture.budget, fixture.count) : measureFloor(fixture.seed, fixture.budget);
      emit({ type: 'row', row: { ...fixture, ...row, wallMs: performance.now() - start,
        memoryBefore: before, memoryAfter: process.memoryUsage() } });
    } catch (error) {
      emit({ type: 'row', row: { ...fixture, status: 'error', error: String(error), stack: error.stack?.split('\n').slice(0, 5) } });
    }
  }
  emit({ type: 'complete' });
} finally { await server.close(); }
