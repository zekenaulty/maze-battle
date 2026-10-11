import { createServer } from 'vite';
import { performance } from 'node:perf_hooks';

const generator = process.argv[2];
if (!['ordinary', 'streamed'].includes(generator)) throw new Error('Unknown diagnostic generator');
const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 60];
const seeds = [0, 1, 7, 42, 55, 20261008];
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const module = await server.ssrLoadModule(`/scripts/dungeon-diagnostics/${generator}.ts`);
  const measure = generator === 'ordinary' ? module.measureOrdinary : module.measureStreamed;
  const rows = [];
  const examples = [];
  for (const level of levels) for (const seed of seeds) {
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    const { geometry, ...result } = measure(seed, level);
    rows.push({ ...result, auditElapsedMs: performance.now() - started,
      heapUsedBeforeBytes: heapBefore, heapUsedAfterBytes: process.memoryUsage().heapUsed });
    if (geometry && seed === 42 && [1, 20, 30, 60].includes(level)) examples.push({ seed, level, geometry });
  }
  const probes = generator === 'ordinary' ? {
    roles: [8, 9, 12, 32].map(count => module.roleBoundaryProbe(count)),
    small: [[1, 1], [1, 9], [2, 2], [3, 3]].map(([r, c]) => {
      const { geometry, ...sample } = module.measureOrdinarySize(r, c, 42);
      return { rows: r, columns: c, ...sample };
    }),
  } : { prefix: (() => {
    const { geometry, ...result } = measure(42, 300, 16);
    return result;
  })() };
  console.log(JSON.stringify({ generator, levels, seeds, rows, examples, probes }));
} finally { await server.close(); }
