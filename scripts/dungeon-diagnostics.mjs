import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderReport } from './dungeon-diagnostics/render.mjs';
import { readCohortOutput } from './dungeon-diagnostics/cohort-output.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) throw new Error('Usage: node scripts/dungeon-diagnostics.mjs [--out directory]');
const output = resolve(args[1] ?? 'test-results/dungeon-d0');
const sourceFiles = ['src/domain/gameFactory.ts', 'src/domain/maze/structuredGenerate.ts',
  'src/domain/maze/structuredRooms.ts', 'src/domain/maze/structuredGraph.ts',
  'src/domain/expedition/topology/generation.ts', 'src/domain/expedition/topology/placement.ts',
  'src/domain/expedition/topology/seed.ts', 'src/domain/expedition/topology/geometry.ts',
  'src/domain/expedition/topology/occupancy.ts', 'src/domain/expedition/schematic.ts'];
const hash = createHash('sha256');
for (const path of sourceFiles) hash.update(path).update(await readFile(path));
const git = (...command) => execFileSync('git', command, { encoding: 'utf8' }).trim();
const evidence = { version: 'dungeon-d0-v1', createdAt: new Date().toISOString(),
  sourceHead: git('rev-parse', 'HEAD'), sourceStatus: git('status', '--porcelain'),
  sourceFiles, sourceSha256: hash.digest('hex'), node: process.version,
  notes: [
    'Privileged offline diagnostics only. No player save, browser, service or provider is used.',
    'Complete means generator returned/sealed; it does not mean structural quality acceptance passed.',
    'Each cohort has a 180-second subprocess timeout and 768MiB JS heap limit. Ordinary cell cap 100000; streamed room cap 512.',
    'Elapsed time includes generation and audit, not isolated generation latency. Heap samples are process snapshots, not retained size or peak.',
    'Ordinary floor dimensions mirror gameFactory and are checked against real descent. Seeded RNG is Mulberry32.',
    'Footprint area, traversable area and allocated/bounding area are different quantities. Compare their definitions, not just percentages.',
  ], cohorts: [] };
await mkdir(output, { recursive: true });
// Invalidate only the two screenshots owned by this report, never other output.
for (const name of ['ordinary-maps.png', 'streamed-maps.png']) await rm(resolve(output, name), { force: true });
for (const generator of ['ordinary', 'streamed']) {
  const processResult = spawnSync(process.execPath, ['--max-old-space-size=768', 'scripts/dungeon-diagnostics/worker.mjs', generator],
    { encoding: 'utf8', timeout: 180_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  const result = readCohortOutput(generator, processResult);
  evidence.cohorts.push(result);
  console.log(`${generator}: ${result.rows.filter(row => row.status === 'complete').length}/${result.rows.length} complete; `
    + `${result.rows.filter(row => row.status === 'limited').length} limited; ${result.rows.filter(row => row.status === 'error').length} errors`);
  if (result.status === 'failed') process.exitCode = 1;
}
await writeFile(resolve(output, 'measurements.json'), JSON.stringify(evidence, null, 2) + '\n');
await writeFile(resolve(output, 'maps.html'), renderReport(evidence));
console.log(`Evidence: ${output}`);
