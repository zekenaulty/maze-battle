import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

function port(name, fallback) {
  const value = process.env[name] ?? String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535) throw Error('Invalid isolated fixture port: ' + name);
  return Number(value);
}
export const browserOrigin = `http://127.0.0.1:${port('MAZE_START_BROWSER_PORT', 5258)}`;
export const serviceOrigin = `http://127.0.0.1:${port('MAZE_START_SERVICE_PORT', 5259)}`;
if (browserOrigin === serviceOrigin) throw Error('Browser and service require distinct ports.');
export function fixtureEnvironment() {
  const env = {};
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'ProgramData', 'ALLUSERSPROFILE', 'CommonProgramFiles',
    'MAZE_START_BROWSER_PORT', 'MAZE_START_SERVICE_PORT'])
    if (process.env[name] !== undefined) env[name] = process.env[name];
  return { ...env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_NOLOGO: '1' };
}
export class ServiceProcess {
  child;
  constructor(dll, storage, log) {
    if (!dll || !storage || !log) throw Error('Run through the explicit pinned fixture launcher.');
    Object.assign(this, { dll, storage, log });
  }
  async start() {
    if (this.child) throw Error('Service already started');
    try {
      await fetch(serviceOrigin + '/api/health', { signal: AbortSignal.timeout(500) });
      throw Error(serviceOrigin + ' already has a listener; refusing reuse.');
    } catch (e) { if (e.message.includes('refusing reuse')) throw e; }
    const child = this.child = spawn('dotnet', [this.dll, this.storage, new URL(serviceOrigin).port], { cwd: tmpdir(), env: fixtureEnvironment(), windowsHide: true });
    child.stdout.on('data', data => appendFileSync(this.log, data));
    child.stderr.on('data', data => appendFileSync(this.log, data));
    let spawnError;
    child.on('error', error => { spawnError = error; });
    for (let i = 0; i < 150; i++) {
      if (spawnError || child.exitCode !== null) throw spawnError ?? Error('Fixture service exited; inspect ' + this.log);
      try {
        const response = await fetch(serviceOrigin + '/fixture/proof', { signal: AbortSignal.timeout(500) });
        const proof = await response.json();
        if (response.ok && proof.processId === child.pid) return proof;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Fixture service startup timed out');
  }
  async stop() {
    const child = this.child; this.child = undefined;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill(); await exited;
  }
  async restart() { await this.stop(); return this.start(); }
}
