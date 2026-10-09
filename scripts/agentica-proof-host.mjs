import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startFixtureProvider } from './agentica-fixture-provider.mjs';

const source = process.env.AGENTICA_FIXTURE_SOURCE;
if (!source) throw new Error('Set AGENTICA_FIXTURE_SOURCE to the qualified Agentica checkout. This launcher never selects a live provider.');
const dotnet = process.env.AGENTICA_DOTNET ?? 'dotnet';
const providerPort = Number(process.env.MAZE_FIXTURE_PROVIDER_PORT ?? 5080);
const servicePort = Number(process.env.MAZE_FIXTURE_SERVICE_PORT ?? 5079);
for (const port of [providerPort, servicePort]) if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid fixture port');
// Playwright clears test-results before a run; live custody must never reside there.
const storage = await mkdtemp(resolve(tmpdir(), 'maze-agentica-proof-'));
const provider = await startFixtureProvider(providerPort);
const assembly = resolve(source, process.env.AGENTICA_FIXTURE_ASSEMBLY
  ?? 'artifacts/fixture-compact-preview/Agentica.Lab.Web.FixtureHost.dll');
// Execute the already-qualified DLL directly, without a build or intermediate dotnet-run process.
const child = spawn(dotnet, [assembly, '--fixture-endpoint', `http://127.0.0.1:${providerPort}/v1/responses`,
  '--urls', `http://127.0.0.1:${servicePort}`, '--Agentica:StorageDirectory', storage],
{ cwd: source, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
let exited = false;
child.once('exit', code => { exited = true; if (code) process.exitCode = code; void provider.close(); });
child.once('error', error => { console.error(error.message); process.exitCode = 1; void provider.close(); });
const close = () => { child.kill(); void provider.close(); };
process.once('SIGINT', close); process.once('SIGTERM', close);
for (let attempt = 0; attempt < 100 && !exited; attempt++) {
  if (await fetch(`http://127.0.0.1:${servicePort}/api/health`, { signal: AbortSignal.timeout(500) }).then(response => response.ok).catch(() => false)) {
    console.log(JSON.stringify({ evidence: 'provider-free proof host ready', servicePort, providerPort, storage, assembly }));
    break;
  }
  await delay(100);
  if (attempt === 99) { close(); throw new Error('Agentica fixture host did not become ready'); }
}
