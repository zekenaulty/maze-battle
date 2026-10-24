import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { LiveBudget, APPROVED_LIMITS, RATES } from './budget.mjs';
import { observeWire, stopThroughUi } from './wire.mjs';

const origin = 'http://127.0.0.1:5488', lab = 'http://127.0.0.1:5078';
const paid = process.argv.includes('--paid-authorized'), prepareOnly = process.argv.includes('--prepare-only');
if (paid === prepareOnly) throw Error('Choose exactly --prepare-only or --paid-authorized; no paid start is implicit');
const paidStop = path.resolve('test-results/live-corpus-paid-stop.json');
if (paid && fs.existsSync(paidStop)) throw Error(`Previous paid trial requires reconciliation and fresh authorization: ${paidStop}`);
const output = path.resolve('test-results', `live-corpus-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const settings = await fetch(lab + '/api/providers/openai/settings').then(r => r.json());
if (settings.model !== 'gpt-6-luna' || settings.thinkingEffort !== 'high' || paid && !settings.configured)
  throw Error('The approved OpenAI Luna/high provider is not ready');
const budget = new LiveBudget(), results = [];
async function reconcile(wire) {
  const ids = new Set(wire.received.map(x => x.frame.runId).filter(Boolean));
  for (let n = 0; n < 25; n++) {
    const runs = await fetch(lab + '/api/runs', { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    budget.reconcileService(runs, ids);
    try { return budget.check({ admission: true }); }
    catch (error) {
      if (budget.failure || n === 24 || !/Reconcile|provider-call count/.test(String(error))) throw error;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}
write('manifest.json', { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  trackedDelta: execFileSync('git', ['diff', '--stat', 'HEAD'], { encoding: 'utf8' }).trim(),
  paid, limits: APPROVED_LIMITS, rates: RATES, origin, lab, model: settings.model, effort: settings.thinkingEffort,
  method: 'Actual App and canonical store; authored topology, ordinary guild acceptance, no discovery prelude; UI Continue only at earned decisions',
  limitsBoundary: 'Coordinator observes provider attempts/usage and cancels; not a service-side pre-dispatch or billing cap. Unknown/failed usage stops both trials.' });
const log = fs.openSync(path.join(output, 'vite.log'), 'w');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/live-corpus/vite.config.ts',
  '--configLoader', 'runner'], { windowsHide: true, stdio: ['ignore', log, log] });
try {
  for (let n = 0; ; n++) {
    if (vite.exitCode !== null || n === 100) throw Error('Isolated Vite failed to start');
    if (await fetch(origin + '/tests/live-corpus/setup.html').then(r => r.ok).catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const variant of ['A', 'B']) {
    budget.check({ admission: true });
    const context = await chromium.launchPersistentContext(path.join(output, `browser-${variant}`),
      { headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage(), wire = observeWire(page, budget);
    const record = { variant, status: 'preparing', decisions: [], wire };
    results.push(record);
    try {
      await page.goto(origin + '/tests/live-corpus/setup.html');
      await page.waitForFunction(() => Boolean(window.liveCorpus));
      record.genesis = await page.evaluate(v => window.liveCorpus.initialize(v), variant);
      await page.getByText(/Dungeon 1 - Ready/).waitFor({ timeout: 30_000 });
      record.setup = await page.evaluate(() => window.liveCorpus.accept());
      if (record.setup.first.cells.length !== 30 || record.setup.first.cells.some(c => c.chests.length)
        || wire.sent.length) throw Error('Cold-start knowledge or provider-free setup differs');
      await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
      await dialog.getByRole('combobox', { name: 'Return quest (optional)' }).selectOption(record.setup.target.contractId);
      await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Retrieve the survey seal from an ordinary chest, then return to the entrance.');
      await page.screenshot({ path: path.join(output, `${variant}-cold-start.png`) });
      if (prepareOnly) { record.status = 'PREPARED-NO-PROVIDER'; continue; }
      budget.check({ admission: true }); budget.begin();
      await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
      let lastDecisionActions = -1;
      for (;;) {
        budget.check();
        if (wire.errors.length) throw Error(wire.errors.join('; '));
        const alerts = await dialog.getByRole('alert').allTextContents();
        if (alerts.length) throw Error(alerts.join('; '));
        const phase = await dialog.getByRole('status').first().innerText();
        const actions = wire.received.filter(x => x.frame.type === 'action.request').length;
        if (phase === 'satisfied') { await reconcile(wire); record.status = 'SATISFIED'; break; }
        if (['failed', 'blocked', 'recovery', 'completed', 'stopped'].includes(phase)) throw Error(`Host stopped: ${phase}`);
        const next = dialog.getByRole('button', { name: 'Continue', exact: true });
        if (phase === 'decision' && actions !== lastDecisionActions && await next.isEnabled()) {
          await reconcile(wire);
          record.decisions.push({ at: Date.now(), actions, phase, budget: budget.snapshot() });
          lastDecisionActions = actions; await next.click();
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      record.final = await page.evaluate(target => window.liveCorpus.effects(target), record.setup.target);
      record.snapshot = await page.evaluate(() => window.liveCorpus.snapshot());
      const replies = wire.sent.filter(x => x.frame.type === 'action.result').map(x => x.frame.payload);
      const completion = replies.findLast(x => x.completion);
      if (record.final.questItems.length !== 1 || record.final.questItems[0].quantity !== 1
        || JSON.stringify(record.final.checkpoint.position) !== JSON.stringify(record.setup.position)
        || !record.final.chest.chest.opened || record.final.quest.quest.status !== 'complete'
        || completion?.observation?.data?.status !== 'satisfied') throw Error('Host-proven objective completion is missing');
      await page.screenshot({ path: path.join(output, `${variant}-satisfied.png`) });
      console.log(variant, record.status, JSON.stringify(budget.snapshot()));
    } catch (error) {
      record.status = 'FAILED'; record.error = String(error);
      await page.screenshot({ path: path.join(output, `${variant}-failed.png`) }).catch(() => {});
      throw error;
    } finally {
      let cleanupFailure;
      await stopThroughUi(page, wire.sent.some(x => x.frame.type === 'start.durable'))
        .catch(error => { record.cleanupError = String(error); record.status = 'RECOVERY-REQUIRED'; cleanupFailure = error; });
      record.afterStop = await page.evaluate(() => window.liveCorpus.snapshot()).catch(String);
      write(`${variant}.json`, record); write('budget.json', budget.snapshot());
      await context.close();
      if (cleanupFailure) throw cleanupFailure;
    }
  }
} catch (error) {
  const failure = { error: String(error), budget: budget.snapshot() };
  write('failure.json', failure);
  if (paid && budget.calls.size) fs.writeFileSync(paidStop, JSON.stringify({ output, ...failure }, null, 2));
  process.exitCode = 1;
}
finally {
  if (vite.exitCode === null) vite.kill('SIGTERM');
  await new Promise(resolve => vite.exitCode !== null ? resolve() : vite.once('exit', resolve));
  fs.closeSync(log); write('summary.json', { output, results: results.map(({ variant, status, error }) => ({ variant, status, error })), budget: budget.snapshot() });
  console.log('Evidence:', output);
}
