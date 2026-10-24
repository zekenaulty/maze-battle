import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { validateCompletion } from './validate.mjs';

const output = path.resolve(process.argv[2] ?? ''), variant = process.argv[3];
assert(['A', 'B'].includes(variant), 'Usage: node audit.mjs EVIDENCE_DIRECTORY A|B');
const record = JSON.parse(fs.readFileSync(path.join(output, `${variant}.json`))), origin = 'http://127.0.0.1:5488';
const completion = validateCompletion(record), actions = record.wire.received.filter(x => x.frame.type === 'action.request').map(x => x.frame.payload);
const replies = record.wire.sent.filter(x => x.frame.type === 'action.result').map(x => x.frame.payload);
assert.equal(record.setup.first.cells.length, 30); assert(record.setup.first.cells.every(c => !c.chests.length));
assert.equal(record.genesis.genesis.checkpoint.knowledge, null);
const explored = actions.filter(a => a.capabilityId === 'maze.explore' && replies.some(r => r.actionId === a.actionId && r.disposition === 'applied' && r.operation));
assert(explored.length > 0, 'At least one accepted engine-owned frontier approach');
for (const action of explored) {
  const prior = record.wire.sent.filter(x => x.frame.type === 'action.result' && x.at <= record.wire.received.find(x => x.frame.type === 'action.request' && x.frame.payload.actionId === action.actionId).at);
  assert(prior.some(x => x.frame.payload.observation?.data?.frontiers?.some(f => f.frontier === action.arguments.frontier)), 'Frontier selected from earned tool evidence');
}
const collected = actions.filter(a => a.capabilityId === 'maze.interact' && replies.some(r => r.actionId === a.actionId && r.disposition === 'applied'));
assert.equal(collected.length, 1, 'One explicit successful collection');
const tools = Object.fromEntries([...new Set(actions.map(a => a.capabilityId))].map(id => [id, actions.filter(a => a.capabilityId === id).length]));
const localSteps = new Map();
for (const { body } of record.wire.http) if (body?.usage?.steps >= 0 && body?.operationId)
  localSteps.set(body.operationId, Math.max(localSteps.get(body.operationId) ?? 0, body.usage.steps));
let server, context, log;
try {
  if (!await fetch(origin + '/tests/live-corpus/setup.html').then(r => r.ok).catch(() => false)) {
    log = fs.openSync(path.join(output, `audit-${variant}-vite.log`), 'w');
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/live-corpus/vite.config.ts', '--configLoader', 'runner'],
      { windowsHide: true, stdio: ['ignore', log, log] });
    for (let n = 0; ; n++) {
      if (server.exitCode !== null || n === 100) throw Error('Read-only audit server failed');
      if (await fetch(origin + '/tests/live-corpus/setup.html').then(r => r.ok).catch(() => false)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  context = await chromium.launchPersistentContext(path.join(output, `browser-${variant}`), { headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', serviceWorkers: 'block' });
  const forbidden = [], page = await context.newPage();
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && request.method() === 'GET' && !url.pathname.startsWith('/api/')) return route.continue();
    forbidden.push(request.url()); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => {
    if (socket.url().startsWith('ws://127.0.0.1:5488/')) return;
    forbidden.push(socket.url()); socket.close();
  });
  await page.goto(origin + '/tests/live-corpus/setup.html'); await page.waitForFunction(() => !!window.liveCorpus);
  const retained = await page.evaluate(() => window.liveCorpus.retained());
  assert.deepEqual(retained.head.roots, record.afterStop.canonical.roots);
  assert.equal(retained.head.revision, record.afterStop.canonical.revision);
  assert.deepEqual(retained.head.allocations, {}); assert.equal(retained.launch.guard.state, 'acknowledged');
  assert.equal(retained.head.checkpoint.position.level, completion.position.level);
  assert.deepEqual(retained.head.checkpoint.position.cell, completion.position.cell);
  assert.deepEqual(forbidden, []);
  const result = { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), variant,
    completion, tools, acceptedExplorations: explored.map(a => ({ mode: a.arguments.mode ?? 'approach', selection: JSON.parse(a.arguments.frontier).selection })),
    localSteps: Object.fromEntries(localSteps), totalLocalSteps: [...localSteps.values()].reduce((a, b) => a + b, 0),
    actionCount: actions.length, refusedActions: replies.filter(r => r.disposition === 'refused').length,
    decisionWindows: record.decisions.length, retained: { revision: retained.head.revision, allocations: retained.head.allocations,
      position: retained.head.checkpoint.position, guard: retained.launch.guard.state }, forbidden };
  fs.writeFileSync(path.join(output, `${variant}-audit.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await context?.close();
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
  if (log !== undefined) fs.closeSync(log);
}
