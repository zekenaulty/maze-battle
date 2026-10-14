import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  AGENTICA_SDK, AUDITED_BLOBS, MAZE_SDK, MAX_FILE_BYTES, PROOF_FILES,
  compareSdk, continuityAssessment, inspectReadiness, parseArgs, sourceIdentity,
} from './ns6-readiness.mjs';

const script = fileURLToPath(new URL('./ns6-readiness.mjs', import.meta.url));
const sdkText = 'export const fixtureOnly = true;\n';

async function put(root, path, text = '// inert source fixture\n') {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

function fixtureGit(root, ...args) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.autocrlf=false',
    '-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=disabled-hooks',
    '-c', 'user.name=Readiness fixture', '-c', 'user.email=fixture@example.invalid', '-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'maze-ns6-readiness-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), 'maze-ns6-readiness-')));
    await rm(root, { recursive: true, force: true });
  });
  const agenticaSource = join(root, 'agentica source');
  const mazeSource = join(root, 'maze source');
  for (const path of new Set([...Object.keys(AUDITED_BLOBS), ...PROOF_FILES.agentica])) {
    await put(agenticaSource, path);
  }
  for (const path of PROOF_FILES.maze) await put(mazeSource, path);
  await put(agenticaSource, AGENTICA_SDK, sdkText);
  await put(mazeSource, MAZE_SDK, sdkText);
  await put(agenticaSource, 'global.json', JSON.stringify({ sdk: { version: '10.0.302', rollForward: 'disable', allowPrerelease: false } }));
  for (const path of [agenticaSource, mazeSource]) {
    fixtureGit(path, 'init');
    fixtureGit(path, 'add', '.');
    fixtureGit(path, 'commit', '-m', 'Synthetic readiness fixture');
  }
  return { agenticaSource, mazeSource };
}

test('requires an explicit source and rejects duplicate, unknown and incomplete CLI flags', () => {
  assert.throws(() => parseArgs([]), /Explicit/);
  assert.throws(() => parseArgs(['--agentica-source']), /Use/);
  assert.throws(() => parseArgs(['--agentica-source', 'a', '--agentica-source', 'b']), /Use/);
  assert.throws(() => parseArgs(['--provider', 'demo']), /Use/);
  assert.throws(() => parseArgs(['--agentica-source', 'a', 'toString', 'b']), /Use/);
  assert.throws(() => parseArgs(['--agentica-source', '--help']), /Use/);
  assert.deepEqual(parseArgs(['--help']), { help: true });
  assert.deepEqual(parseArgs(['--agentica-source', 'a b', '--maze-source', 'c d']), { agenticaSource: 'a b', mazeSource: 'c d' });
});

test('clean synthetic checkouts report unknown baseline, not runtime readiness', async t => {
  const report = await inspectReadiness(await fixture(t));
  assert.equal(report.status, 'unknown');
  assert.equal(report.source.git.dirty, false);
  assert.equal(report.source.git.reason, 'unreviewed_head');
  assert.equal(report.source.audit.status, 'unknown');
  assert.equal(report.sdkCompatibility.reason, 'matching_but_unreviewed_sdk');
  assert.equal(report.continuity.status, 'unknown');
  assert.equal(report.prerequisites.find(p => p.id === 'proof_source_files').status, 'ready');
  assert.equal(report.prerequisites.find(p => p.id === 'dotnet_sdk').requiredVersion, '10.0.302');
  assert.equal(report.prerequisites.find(p => p.id === 'ns6_integration_proof').status, 'unknown');
});

test('SDK content mismatch is an unmet prerequisite even when both files exist', async t => {
  const paths = await fixture(t);
  await put(paths.mazeSource, MAZE_SDK, 'export const different = true;\n');
  const report = await inspectReadiness(paths);
  assert.equal(report.status, 'missing');
  assert.equal(report.sdkCompatibility.status, 'missing');
  assert.equal(report.sdkCompatibility.reason, 'sdk_content_mismatch');
  assert.equal(report.sdkCompatibility.lineEndingsOnly, false);
});

test('only CRLF conversion is ignored for content identity; BOM and code changes are not', () => {
  const lf = sourceIdentity(Buffer.from(sdkText));
  const crlf = sourceIdentity(Buffer.from(sdkText.replace(/\n/g, '\r\n')));
  assert.notEqual(lf.sha256, crlf.sha256);
  assert.equal(lf.lfNormalizedGitBlob, crlf.lfNormalizedGitBlob);
  assert.notEqual(lf.lfNormalizedGitBlob, sourceIdentity(Buffer.from(`\ufeff${sdkText}`)).lfNormalizedGitBlob);
  const result = compareSdk({ status: 'ready', ...lf }, { status: 'ready', ...crlf });
  assert.equal(result.lineEndingsOnly, true);
  assert.equal(result.status, 'unknown');
  // Unit-test the pinned identity branch without pretending synthetic code is the SDK.
  const pinned = { status: 'ready', sha256: 'synthetic', lfNormalizedGitBlob: AUDITED_BLOBS[AGENTICA_SDK] };
  assert.equal(compareSdk(pinned, pinned).status, 'ready');
});

test('missing SDK is reported without falling back to another installed checkout', async t => {
  const paths = await fixture(t);
  await rm(join(paths.agenticaSource, AGENTICA_SDK));
  const report = await inspectReadiness(paths);
  assert.equal(report.sdkCompatibility.status, 'missing');
  assert.equal(report.sdkCompatibility.agentica.reason, 'not_found');
  assert.equal(report.source.audit.status, 'missing');
});

test('missing source checkout stays missing even if git metadata cannot be read', async t => {
  const paths = await fixture(t);
  paths.agenticaSource = join(paths.agenticaSource, 'absent');
  const report = await inspectReadiness(paths);
  assert.equal(report.status, 'missing');
  assert.equal(report.source.status, 'missing');
  assert.equal(report.source.git.dirty, null);
  assert.equal(report.continuity.status, 'unknown');
});

test('dirty source reports staged, unstaged and untracked paths without editing them', async t => {
  const paths = await fixture(t);
  await put(paths.agenticaSource, 'staged.txt', 'staged\n');
  fixtureGit(paths.agenticaSource, 'add', 'staged.txt');
  await put(paths.agenticaSource, 'Agentica.Lab.Web/Runtime/HostRun.cs', '// edited\n');
  await put(paths.agenticaSource, 'new work.txt', 'keep\n');
  const indexBefore = await readFile(join(paths.agenticaSource, '.git/index'));
  const report = await inspectReadiness(paths);
  assert.equal(report.source.git.dirty, true);
  assert.equal(report.source.git.reason, 'dirty_source');
  assert.equal(report.source.git.status, 'unknown');
  assert.ok(report.source.git.changes.some(c => c.code === 'A ' && c.path === 'staged.txt'));
  assert.ok(report.source.git.changes.some(c => c.code === ' M' && c.path.endsWith('HostRun.cs')));
  assert.ok(report.source.git.changes.some(c => c.code === '??' && c.path === 'new work.txt'));
  assert.deepEqual(await readFile(join(paths.agenticaSource, '.git/index')), indexBefore);
});

test('rename paths and bounded dirty summaries preserve the total change count', async t => {
  const paths = await fixture(t);
  fixtureGit(paths.agenticaSource, 'mv', 'global.json', 'renamed global.json');
  for (let i = 0; i < 70; i++) await put(paths.agenticaSource, `untracked/${i}.txt`);
  const report = await inspectReadiness(paths);
  assert.equal(report.source.git.changeCount, 71);
  assert.equal(report.source.git.changes.length, 64);
  assert.equal(report.source.git.changesTruncated, true);
  assert.ok(report.source.git.changes.some(c => c.code === 'R ' && c.originalPath === 'global.json' && c.path === 'renamed global.json'));
});

test('a child directory cannot borrow the parent checkout identity', async t => {
  const paths = await fixture(t);
  const report = await inspectReadiness({ ...paths, agenticaSource: join(paths.agenticaSource, 'Agentica.Lab.Web') });
  assert.equal(report.source.git.reason, 'not_checkout_root');
  assert.equal(report.source.git.dirty, null);
});

test('malformed pin, absent fixture source and oversized files remain explicit', async t => {
  const paths = await fixture(t);
  await put(paths.agenticaSource, 'global.json', '{broken');
  await rm(join(paths.agenticaSource, 'samples/Agentica.Lab.Web.FixtureHost/Program.cs'));
  await put(paths.agenticaSource, AGENTICA_SDK, Buffer.alloc(MAX_FILE_BYTES + 1, 65));
  const report = await inspectReadiness(paths);
  assert.equal(report.prerequisites.find(p => p.id === 'dotnet_sdk').reason, 'invalid_global_json');
  assert.equal(report.prerequisites.find(p => p.id === 'proof_source_files').status, 'missing');
  assert.equal(report.sdkCompatibility.agentica.reason, 'file_read_bound');
  assert.equal(report.sdkCompatibility.status, 'unknown');
});

test('empty and non-UTF8 sources never become compatible', async t => {
  const paths = await fixture(t);
  await put(paths.agenticaSource, AGENTICA_SDK, '');
  let report = await inspectReadiness(paths);
  assert.equal(report.sdkCompatibility.agentica.reason, 'empty_file');
  await put(paths.agenticaSource, AGENTICA_SDK, Buffer.from([0xff]));
  report = await inspectReadiness(paths);
  assert.equal(report.sdkCompatibility.agentica.status, 'unknown');
});

test('continuity finding is historical unless the exact audited source matches', () => {
  assert.equal(continuityAssessment('ready').status, 'missing');
  assert.equal(continuityAssessment('unknown').status, 'unknown');
  assert.equal(continuityAssessment('missing').status, 'unknown');
  assert.equal(continuityAssessment('unknown').baselineFinding, 'missing');
});

async function snapshot(root) {
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile());
  const result = {};
  for (const file of files) {
    const path = join(file.parentPath, file.name);
    result[path] = (await readFile(path)).toString('base64');
  }
  return result;
}

test('CLI emits JSON, does not import fixture code, and leaves both trees byte-identical', async t => {
  const paths = await fixture(t);
  await put(paths.mazeSource, 'scripts/ns6-paired-provider.mjs', 'throw new Error("MUST NOT EXECUTE");\n');
  const before = [await snapshot(paths.agenticaSource), await snapshot(paths.mazeSource)];
  const child = spawnSync(process.execPath, [script, '--agentica-source', paths.agenticaSource, '--maze-source', paths.mazeSource], {
    encoding: 'utf8', windowsHide: true, timeout: 15000,
  });
  assert.equal(child.status, 1);
  assert.equal(child.stderr, '');
  const report = JSON.parse(child.stdout);
  assert.equal(report.evidenceLevel, 'read_only_source_preflight');
  assert.deepEqual(report.effects, { providerCalls: 0, servicesStarted: 0, settingsChanged: false, filesWritten: false });
  assert.deepEqual([await snapshot(paths.agenticaSource), await snapshot(paths.mazeSource)], before);
});

test('CLI missing explicit source exits as usage error without using environment fallback', () => {
  const child = spawnSync(process.execPath, [script], { encoding: 'utf8', windowsHide: true,
    env: { ...process.env, AGENTICA_FIXTURE_SOURCE: 'not-authorized-as-an-implicit-source' } });
  assert.equal(child.status, 2);
  assert.match(JSON.parse(child.stdout).error, /Explicit/);
});
