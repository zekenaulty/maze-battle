import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENTICA_BASELINE = '4c481b6e54bfed319dc3c79776973d34fe99b9e4';
export const MAZE_BASELINE = 'b12a8c37df17612d249a48bf9f2d419c20363c4c';
export const AGENTICA_SDK = 'Agentica.Lab.Web/wwwroot/sdk/agentica-host.mjs';
export const MAZE_SDK = 'src/services/agentica/sdk/agentica-host.mjs';
export const MAX_FILE_BYTES = 1024 * 1024;
const MAX_CHANGES = 64;
const DEFAULT_MAZE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// These are reviewed source identities, not a syntax-based detector of future APIs.
export const AUDITED_BLOBS = Object.freeze({
  'Agentica.Lab.Web/Contracts/HostProtocol.cs': '038a8a33fbe2301cc5f04fc6765d3427d64653f2',
  'Agentica.Lab.Web/Contracts/ProtocolValidation.cs': '8a0bf62a955cbcdcde17c3f46842d8d8f5d8015b',
  'Agentica.Lab.Web/LabWebApplication.cs': '013849585e3a70ff347a9065e2c9fdc4ad59c05a',
  'Agentica.Lab.Web/Runtime/ActionCustodyStore.cs': '20bd4251156b10d4b2c18841626df8dc27b9b98e',
  'Agentica.Lab.Web/Runtime/HostRun.cs': '06c6160e469c4b7a0ce9eca85287987216a73244',
  'Agentica.Lab.Web/Runtime/HostRunRegistry.cs': '5f54ad86251ccc1781ac5a17f5e62677ad2e448a',
  'Agentica/Execution/AgenticaRunner.cs': 'e8d2c0ab25aa01e102fed183ee5cc9afb974da31',
  'Agentica/Execution/ExecutionPolicy.cs': 'e58c94c542bcdcf6816d8a123e01bb70bb7092ba',
  'Agentica/Execution/EvidenceCompletionEvaluator.cs': '531d7d00a2b9121c27b96b92750a604bdc74e999',
  [AGENTICA_SDK]: 'a4228c9382f2dd35d104f962e8561280cba6de7d',
});

export const PROOF_FILES = Object.freeze({
  agentica: [
    'global.json',
    'Agentica.Lab.Web/Agentica.Lab.Web.csproj',
    'samples/Agentica.Lab.Web.FixtureHost/Agentica.Lab.Web.FixtureHost.csproj',
    'samples/Agentica.Lab.Web.FixtureHost/Program.cs',
    'samples/Agentica.Lab.Web.FixtureHost/LoopbackFixturePlannerFactory.cs',
    'samples/Agentica.Lab.Web.FixtureHost/FixtureHostOptions.cs',
    'Agentica.Lab.Web.Tests/HostRuntimeTests.cs',
    'browser-tests/host-sdk.test.mjs',
    'browser-tests/service-integration.test.mjs',
  ],
  maze: [
    'scripts/agentica-proof-host.mjs',
    'scripts/agentica-fixture-provider.mjs',
    'scripts/agentica-fixture-context.mjs',
    'tests/e2e/agentica-proving.spec.ts',
    'tests/e2e/agentica-takeover.spec.ts',
    'docs/evidence/agentica-fixture-2026-10-09.json',
  ],
});

function aggregate(items) {
  return items.some(item => item.status === 'missing') ? 'missing'
    : items.some(item => item.status === 'unknown') ? 'unknown' : 'ready';
}

function hash(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest('hex');
}

export function sourceIdentity(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const normalized = Buffer.from(text.replace(/\r\n/g, '\n'));
  return { sha256: hash('sha256', bytes), lfNormalizedGitBlob: hash('sha1',
    Buffer.concat([Buffer.from(`blob ${normalized.length}\0`), normalized])) };
}

async function inspectFile(root, path) {
  let handle;
  try {
    handle = await open(resolve(root, path), 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) return { path, status: 'missing', reason: 'not_regular_file' };
    if (stat.size > MAX_FILE_BYTES) return { path, status: 'unknown', reason: 'file_read_bound' };
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_FILE_BYTES) return { path, status: 'unknown', reason: 'file_read_bound' };
    if (length === 0) return { path, status: 'missing', reason: 'empty_file' };
    const bytes = buffer.subarray(0, length);
    return { path, status: 'ready', reason: 'readable_source_only', bytes: length,
      ...sourceIdentity(bytes), text: bytes.toString('utf8') };
  } catch (error) {
    return { path, status: ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'missing' : 'unknown',
      reason: ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'not_found' : 'unreadable_or_non_utf8' };
  } finally {
    await handle?.close();
  }
}

function publicFile({ text, ...entry }) { return entry; }

function git(root, args) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, ...args], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 128 * 1024, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
}

async function inspectGit(root, expectedHead) {
  try {
    const topLevel = git(root, ['rev-parse', '--show-toplevel']).trim();
    if (await realpath(topLevel) !== await realpath(root)) {
      return { status: 'unknown', reason: 'not_checkout_root', expectedHead, dirty: null };
    }
    const head = git(root, ['rev-parse', '--verify', 'HEAD']).trim();
    const records = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0');
    const changes = [];
    for (let i = 0; i < records.length; i++) {
      if (!records[i]) continue;
      const code = records[i].slice(0, 2);
      const change = { code, path: records[i].slice(3) };
      if (/[RC]/.test(code)) change.originalPath = records[++i];
      changes.push(change);
    }
    const dirty = changes.length > 0;
    return { status: dirty || head !== expectedHead ? 'unknown' : 'ready',
      reason: dirty ? 'dirty_source' : head !== expectedHead ? 'unreviewed_head' : 'clean_baseline',
      head, expectedHead, matchesBaseline: head === expectedHead, dirty,
      changeCount: changes.length, changes: changes.slice(0, MAX_CHANGES),
      changesTruncated: changes.length > MAX_CHANGES };
  } catch {
    return { status: 'unknown', reason: 'git_unavailable_or_read_bound', expectedHead, dirty: null };
  }
}

export function compareSdk(agentica, maze) {
  const available = aggregate([agentica, maze]);
  if (available !== 'ready') return { status: available, reason: 'sdk_not_inspectable', agentica, maze };
  const sameContent = agentica.lfNormalizedGitBlob === maze.lfNormalizedGitBlob;
  const matchesBaseline = agentica.lfNormalizedGitBlob === AUDITED_BLOBS[AGENTICA_SDK];
  return {
    status: !sameContent ? 'missing' : matchesBaseline ? 'ready' : 'unknown',
    reason: !sameContent ? 'sdk_content_mismatch' : matchesBaseline ? 'reviewed_sdk_content_matches' : 'matching_but_unreviewed_sdk',
    exactBytesMatch: agentica.sha256 === maze.sha256,
    lineEndingsOnly: sameContent && agentica.sha256 !== maze.sha256,
    matchesBaseline, agentica, maze,
  };
}

export function continuityAssessment(auditStatus) {
  return {
    status: auditStatus === 'ready' ? 'missing' : 'unknown',
    reason: auditStatus === 'ready' ? 'generic_park_wake_seam_missing' : 'source_audit_required',
    reviewedBaseline: AGENTICA_BASELINE,
    baselineFinding: 'missing',
    admission: 'An applied result may acknowledge durable host admission; omit completion until the game proves arrival.',
    gap: 'No durable operation binding plus planner park/wake path across action windows. Applied admission triggers stepwise refinement; immutable action results cannot later become arrival results.',
    existingBoundary: 'Awaiting onAction avoids model polling only inside the bounded request; late recovery settles original custody but does not restart a terminal run.',
    requiredHandoff: [
      'Bind operationId to original action, objective, host/session/epoch, scope/perspective, manifest and immutable admission evidence.',
      'Park cognition after admission; host-local progress must not invoke the planner or assert objective completion.',
      'Retain checkpoint, observation/evidence identity, attempt fences and configured cumulative budgets across yield/reload/takeover; null budgets remain unlimited.',
      'Wake once on verified completion, consequential decision, revocation, exhausted hard bound or non-resumable blocker.',
      'Reconcile original uncertain effects before successor custody; never rewrite admission into arrival.',
    ],
    designStatus: 'proposed_contract_not_implemented',
  };
}

export async function inspectReadiness({ agenticaSource, mazeSource = DEFAULT_MAZE } = {}) {
  if (typeof agenticaSource !== 'string' || !agenticaSource.trim()) throw new Error('Explicit --agentica-source is required.');
  const agenticaRoot = resolve(agenticaSource);
  const mazeRoot = resolve(mazeSource);
  const sourceGit = await inspectGit(agenticaRoot, AGENTICA_BASELINE);
  const mazeGit = await inspectGit(mazeRoot, MAZE_BASELINE);
  const auditedFiles = [];
  for (const [path, expectedBlob] of Object.entries(AUDITED_BLOBS)) {
    const file = publicFile(await inspectFile(agenticaRoot, path));
    auditedFiles.push({ ...file, expectedBlob, status: file.status !== 'ready' ? file.status
      : file.lfNormalizedGitBlob === expectedBlob ? 'ready' : 'unknown',
    reason: file.status !== 'ready' ? file.reason : file.lfNormalizedGitBlob === expectedBlob ? 'reviewed_blob' : 'source_drift' });
  }
  const sourceAudit = { status: aggregate(auditedFiles), files: auditedFiles };
  // Compatibility is independent of git cleanliness and of runtime qualification.
  const sdkCompatibility = compareSdk(publicFile(await inspectFile(agenticaRoot, AGENTICA_SDK)),
    publicFile(await inspectFile(mazeRoot, MAZE_SDK)));
  const proofFiles = [];
  let dotnetSdk = { status: 'missing', reason: 'global_json_missing' };
  for (const [owner, paths] of Object.entries(PROOF_FILES)) {
    for (const path of paths) {
      const file = await inspectFile(owner === 'agentica' ? agenticaRoot : mazeRoot, path);
      proofFiles.push({ owner, ...publicFile(file) });
      if (owner === 'agentica' && path === 'global.json') {
        dotnetSdk = { status: file.status, reason: file.reason };
        if (file.status === 'ready') {
          try {
            const { sdk } = JSON.parse(file.text);
            if (typeof sdk?.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(sdk.version)) throw new Error('Invalid SDK pin');
            dotnetSdk = { status: 'unknown', reason: 'installed_sdk_not_probed', requiredVersion: sdk.version,
              rollForward: sdk.rollForward ?? null, allowPrerelease: sdk.allowPrerelease ?? null };
          } catch { dotnetSdk = { status: 'unknown', reason: 'invalid_global_json' }; }
        }
      }
    }
  }
  const prerequisites = [
    { id: 'node_runtime', status: Number(process.versions.node.split('.')[0]) >= 22 ? 'ready' : 'missing',
      required: 'Node >= 22', observed: process.versions.node },
    { id: 'proof_source_files', status: aggregate(proofFiles), files: proofFiles,
      evidence: 'presence_only_not_execution' },
    { id: 'dotnet_sdk', ...dotnetSdk },
    { id: 'qualified_fixture_assembly', status: 'unknown', reason: 'build_and_binary_provenance_not_verified' },
    { id: 'browser_and_dependencies', status: 'unknown', reason: 'not_loaded_or_launched' },
    { id: 'ns6_integration_proof', status: 'unknown', reason: 'exact_head_destination_continuity_cohort_not_run' },
  ];
  const continuity = continuityAssessment(sourceAudit.status);
  const source = { path: agenticaRoot, status: aggregate([sourceGit, sourceAudit]), git: sourceGit, audit: sourceAudit };
  return {
    schemaVersion: 1, evidenceLevel: 'read_only_source_preflight',
    status: aggregate([source, mazeGit, sdkCompatibility, continuity, ...prerequisites]),
    effects: { providerCalls: 0, servicesStarted: 0, settingsChanged: false, filesWritten: false },
    source, maze: { path: mazeRoot, git: mazeGit }, sdkCompatibility, continuity, prerequisites,
    limitations: [
      'Bounded working-file reads are not an atomic snapshot of an active checkout.',
      'Ready means only the named check passed; SDK equality and historical ledgers do not qualify NS-6.',
      'No dotnet, package manager, browser, build, endpoint or provider was invoked; no credentials were read.',
      'Access control, auth, origins, deployment, SDK changes and protocol replacement are outside this work.',
    ],
  };
}

export function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const result = {};
  const keys = { '--agentica-source': 'agenticaSource', '--maze-source': 'mazeSource' };
  for (let i = 0; i < args.length; i += 2) {
    const key = Object.hasOwn(keys, args[i]) ? keys[args[i]] : undefined;
    if (!key || result[key] !== undefined || !args[i + 1]?.trim() || args[i + 1].startsWith('--')) {
      throw new Error('Use --agentica-source <checkout> [--maze-source <checkout>]; each option once.');
    }
    result[key] = args[i + 1];
  }
  if (!result.agenticaSource) throw new Error('Explicit --agentica-source is required.');
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('node scripts/ns6-readiness.mjs --agentica-source <checkout> [--maze-source <checkout>]\nRead-only, provider-free JSON. Exit 0: ready; 1: missing/unknown; 2: usage/inspection error.');
    } else {
      const report = await inspectReadiness(options);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.status === 'ready' ? 0 : 1;
    }
  } catch (error) {
    console.log(JSON.stringify({ schemaVersion: 1, status: 'unknown', error: error.message }));
    process.exitCode = 2;
  }
}
