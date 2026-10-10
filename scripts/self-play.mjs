import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const value = (key, fallback) => args.includes(key) ? Number(args[args.indexOf(key) + 1]) : fallback;
const options = { seed: value('--seed', 42), floors: value('--floors', 3), maxSteps: value('--steps', 10000), rows: value('--rows', 9), columns: value('--columns', 13), encounters: !args.includes('--no-encounters') };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { createSelfPlay, stepSelfPlay, selfPlayReport } = await server.ssrLoadModule('/src/domain/simulation/selfPlay.ts');
  const run = createSelfPlay(options);
  while (run.outcome === 'running') stepSelfPlay(run, 100);
  const report = selfPlayReport(run);
  await mkdir('test-results/self-play', { recursive: true });
  const path = `test-results/self-play/seed-${options.seed}-${options.rows}x${options.columns}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, telemetry: undefined, snapshot: undefined, artifact: path }, null, 2));
  process.exitCode = report.outcome === 'complete' && report.counters.prematureDescents === 0
    && report.remaining.chests.length === 0 && report.remaining.quests.length === 0 ? 0 : 1;
} finally { await server.close(); }
