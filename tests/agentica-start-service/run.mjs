import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { fixtureEnvironment } from './service.mjs';

const pin = '602f15ac24a60faee8665cb165cb2d7c761c9eed';
if (process.argv.length !== 4 || process.argv[2] !== '--agentica-root') throw Error('Usage: node run.mjs --agentica-root ABSOLUTE_ROOT');
const external = process.argv[3];
if (!path.isAbsolute(external)) throw Error('Agentica root must be absolute');
const git = (...args) => execFileSync('git', ['-C', external, ...args], { encoding: 'utf8', env: fixtureEnvironment() }).trim();
if (git('rev-parse', 'HEAD') !== pin || git('status', '--porcelain')) throw Error('Agentica must be clean at ' + pin);
const folder = path.dirname(fileURLToPath(import.meta.url)), maze = path.resolve(folder, '../..');
const sdkSource = readFileSync(path.join(maze, 'src/services/agentica/sdk/agentica-host.mjs'), 'utf8').replace(/\r\n/g, '\n');
if (sdkSource !== readFileSync(path.join(external, 'Agentica.Lab.Web/wwwroot/sdk/agentica-host.mjs'), 'utf8').replace(/\r\n/g, '\n'))
  throw Error('Maze SDK does not match the pinned service SDK (ignoring CRLF).');
const sdkSourceSha256 = createHash('sha256').update(sdkSource).digest('hex');
const temp = mkdtempSync(path.join(tmpdir(), 'maze-start-service-'));
const output = path.join(maze, 'test-results', path.basename(temp));
mkdirSync(output, { recursive: true });
const artifacts = path.join(temp, 'artifacts'), storage = path.join(temp, 'storage');
const env = fixtureEnvironment();
const version = execFileSync('dotnet', ['--version'], { cwd: temp, env, encoding: 'utf8' }).trim();
if (version !== '10.0.401') throw Error('This unpinned qualification explicitly requires SDK 10.0.401, observed ' + version);
async function run(command, args, cwd, environment) {
  const child = spawn(command, args, { cwd, env: environment, windowsHide: true, stdio: 'inherit' });
  return new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
}
const build = ['build', path.join(folder, 'StartServiceFixture.csproj'), '--configuration', 'Release',
  '--artifacts-path', artifacts, '--disable-build-servers', '-p:AgenticaRoot=' + external,
  '-p:RestoreConfigFile=' + path.join(folder, 'NuGet.Config'), '-p:RestoreLockedMode=true',
  '-p:NuGetAudit=false', '-p:UseSharedCompilation=false'];
if (await run('dotnet', build, temp, env)) throw Error('Fixture build failed');
const dll = path.join(artifacts, 'bin', 'StartServiceFixture', 'release', 'StartServiceFixture.dll');
const assemblies = Object.fromEntries(['StartServiceFixture.dll', 'Agentica.Lab.Web.dll', 'Agentica.dll', 'Agentica.Clients.dll']
  .map(name => [name, createHash('sha256').update(readFileSync(path.join(path.dirname(dll), name))).digest('hex')]));
const command = ['node_modules/@playwright/test/cli.js', 'test', '--config', 'tests/e2e/canonical-start-service.config.ts',
  '--workers=1', '--retries=0', '--trace=on', '--output', path.join(output, 'browser')];
const metadata = { mazeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: maze, encoding: 'utf8' }).trim(),
  agenticaCommit: pin, sdk: version, repositorySdkPin: '10.0.302', pinProof: false, sdkSourceSha256, assemblies, temp, output,
  build: { cwd: temp, args: build }, browser: { cwd: maze, args: command } };
writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify(metadata, null, 2));
const code = await run(process.execPath, command, maze, { ...env,
  MAZE_START_SERVICE_DLL: dll, MAZE_START_SERVICE_STORAGE: storage, MAZE_START_SERVICE_LOG: path.join(output, 'service.log'),
  PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(output, 'results.json') });
if (git('rev-parse', 'HEAD') !== pin || git('status', '--porcelain')) throw Error('External Agentica source changed during proof');
console.log('Proof: ' + output);
process.exitCode = code;
