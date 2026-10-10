import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { startDirectedFixture } from './ns6-paired-provider.mjs';

const source = process.env.AGENTICA_FIXTURE_SOURCE;
if (!source) throw new Error('Set AGENTICA_FIXTURE_SOURCE to the qualified durable-handoff checkout.');
const dotnet = process.env.AGENTICA_DOTNET ?? 'dotnet';
const assembly = resolve(source, process.env.AGENTICA_FIXTURE_ASSEMBLY ?? 'artifacts/durable-handoff-fixture/Agentica.Lab.Web.FixtureHost.dll');
const storage = await mkdtemp(resolve(tmpdir(), 'maze-ns6-paired-'));
const service = Number(process.env.NS6_SERVICE_PORT ?? 5085), providerPort = Number(process.env.NS6_PROVIDER_PORT ?? 5086);
for (const port of [service, providerPort]) if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid fixture port');
let child;
const start = async () => {
  child = spawn(dotnet, [assembly, '--fixture-endpoint', `http://127.0.0.1:${providerPort}/v1/responses`,
    '--urls', `http://127.0.0.1:${service}`, '--Agentica:StorageDirectory', storage], { cwd: source, windowsHide: true, stdio: 'inherit' });
  let failed = false; child.once('error', () => { failed = true; }); child.once('exit', () => { failed = true; });
  for (let attempt = 0; attempt < 100 && !failed; attempt++) {
    if (await fetch(`http://127.0.0.1:${service}/api/health`, { signal: AbortSignal.timeout(500) }).then(r => r.ok).catch(() => false)) return;
    await delay(100);
  }
  throw new Error('Qualified service failed to start.');
};
const stop = async () => { if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); };
const provider = await startDirectedFixture(providerPort, async () => { await stop(); await start(); });
try { await start(); } catch (error) { await stop(); await provider.close(); throw error; }
console.log(JSON.stringify({ source, assembly, storage, service, providerPort, proof: 'provider-free NS-6' }));
const close = async () => { await stop(); await provider.close(); };
process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close());
