import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform, release, arch } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorker } from './worker-output.mjs';
import { runBounded } from './bounded-process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--render')) throw new Error('Usage: node scripts/d1-measurements/run.mjs [--render]');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
const sourceFiles = git('ls-files', 'src', 'package.json', 'package-lock.json').split(/\r?\n/).filter(Boolean);
const hashFiles = files => {
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update(readFileSync(file));
  return hash.digest('hex');
};
const harnessFiles = ['run.mjs', 'worker.mjs', 'worker-output.mjs', 'bounded-process.mjs', 'measure.ts', 'render.mjs', 'canvas.html']
  .map(name => `scripts/d1-measurements/${name}`);
const evidence = {
  schema: 'd1-measurements-v1', recordedAt: new Date().toISOString(),
  sourceHead: git('rev-parse', 'HEAD'), sourceSha256: hashFiles(sourceFiles),
  sourceHashDefinition: 'sha256 of sorted git ls-files src package.json package-lock.json: path then raw bytes',
  harnessSha256: hashFiles(harnessFiles), harnessFiles,
  runtime: { node: process.version, vite: JSON.parse(readFileSync('node_modules/vite/package.json')).version,
    os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem() },
  limits: { cohortMs: 180000, cooperativeMs: 155000, oldSpaceMiB: 768, traversalMsPerFixture: 10000, movesPerFixture: 1024 },
  cohorts: [],
};
await mkdir('docs/evidence/d1', { recursive: true });
for (const cohort of ['domain', ...(args.includes('--render') ? ['render'] : [])]) {
  const start = performance.now();
  const worker = await runBounded(['--max-old-space-size=768', '--expose-gc',
    `scripts/d1-measurements/${cohort === 'domain' ? 'worker' : 'render'}.mjs`]);
  const result = parseWorker(cohort, worker);
  result.wallMs = performance.now() - start;
  evidence.cohorts.push(result);
  console.log(`${cohort}: ${result.status}; ${result.rows.length} records; ${result.wallMs.toFixed(0)}ms`);
  if (result.status !== 'complete') process.exitCode = 1;
  await writeFile('docs/evidence/d1/measurements.json', JSON.stringify(evidence) + '\n');
}
evidence.sourceUnchanged = hashFiles(sourceFiles) === evidence.sourceSha256;
if (!evidence.sourceUnchanged) process.exitCode = 1;
await writeFile('docs/evidence/d1/measurements.json', JSON.stringify(evidence) + '\n');
console.log('docs/evidence/d1/measurements.json');
