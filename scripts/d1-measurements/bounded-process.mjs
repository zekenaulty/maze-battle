import { spawn, execFile } from 'node:child_process';

// Kill only the process tree this invocation created, including its isolated browser.
export function runBounded(args, timeoutMs = 180000, maxBytes = 16 * 1024 * 1024) {
  return new Promise(resolve => {
    const windows = process.platform === 'win32';
    const child = spawn(process.execPath, args, { windowsHide: true, detached: !windows, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', error, stopping = false;
    const stop = reason => {
      if (stopping) return;
      stopping = true;
      error = new Error(reason);
      if (!child.pid) return;
      if (windows) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => {});
      else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    };
    const timer = setTimeout(() => stop('Cohort wall timeout'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (Buffer.byteLength(stdout) + Buffer.byteLength(chunk) > maxBytes) stop('Output budget exceeded');
      else stdout += chunk;
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
    child.on('error', value => { error = value; });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, error, status, signal });
    });
  });
}
