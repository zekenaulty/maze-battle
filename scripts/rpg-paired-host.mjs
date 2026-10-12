import { spawn, execFileSync } from 'node:child_process';
import { access, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { startRpgFixture } from './rpg-paired-provider.mjs';

const source = process.env.AGENTICA_FIXTURE_SOURCE;
if (!source) throw new Error('Set AGENTICA_FIXTURE_SOURCE to the qualified durable-handoff checkout.');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8', windowsHide: true }).trim();
if (revision !== '1e1a2df3c489d633b62b739b7bd61eba2cfa3c5d') throw new Error('Expected qualified Agentica fixture HEAD 1e1a2df.');
const assembly = resolve(source, 'artifacts/durable-handoff-fixture/Agentica.Lab.Web.FixtureHost.dll');
await access(assembly);
const storage = await mkdtemp(resolve(tmpdir(), 'maze-rpg-paired-'));
const service = 5092, providerPort = 5093, dotnet = process.env.AGENTICA_DOTNET ?? 'dotnet';
// Refuse occupied ports. Never stop or reuse another developer's service.
const probe = createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(service, '127.0.0.1', resolve); });
await new Promise(resolve => probe.close(resolve));
let child, closing;
const stop = async () => {
  if (child && child.exitCode === null && child.signalCode === null)
    await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
};
const start = async () => {
  child = spawn(dotnet, [assembly, '--fixture-endpoint', `http://127.0.0.1:${providerPort}/v1/responses`,
    '--urls', `http://127.0.0.1:${service}`, '--Agentica:StorageDirectory', storage],
  { cwd: source, windowsHide: true, stdio: 'inherit' });
  let failed; child.once('error', error => { failed = error; }); child.once('exit', code => { failed = new Error(`Fixture exited: ${code}`); });
  for (let attempt = 0; attempt < 100 && !failed; attempt++) {
    if (await fetch(`http://127.0.0.1:${service}/api/health`, { signal: AbortSignal.timeout(500) }).then(r => r.ok).catch(() => false)) return;
    await delay(100);
  }
  throw failed ?? new Error('Qualified RPG service failed to start.');
};
const provider = await startRpgFixture(providerPort, async () => { await stop(); await start(); });
const close = () => closing ??= (async () => { await stop(); await provider.close(); })();
process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close());
try { await start(); } catch (error) { await close(); throw error; }
console.log(JSON.stringify({ source, revision, assembly, storage, service, providerPort, proof: 'provider-free actual RPG' }));
