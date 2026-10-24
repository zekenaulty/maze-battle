import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { comparePublicWire, assertPublicWireDisclosure } from './canonical-start-service.public-wire.mjs';
import { compareCausalPublicWire, assertCausalPublicWireDisclosure } from './canonical-start-service.public-wire-causal.mjs';
import { canonical } from './canonical-start-service.planner-compare.mjs';

// Artifact-only recheck. No browser, service, provider or production database access.
const [input, output, mode, custodyFile, failedMode] = process.argv.slice(2);
assert.ok(input && output && (mode === undefined || mode === '--causal' && custodyFile),
  'Usage: node public-wire-audit.mjs RESULTS_JSON OUTPUT_JSON [--causal CUSTODY_LEDGER_JSON]');
assert.ok(failedMode === undefined || failedMode === '--allow-failed-comparison', 'Unknown artifact audit option');
const bytes = readFileSync(input), results = JSON.parse(bytes), cases = [];
function visit(suite) {
  for (const spec of suite.specs ?? []) if (spec.title === 'paired corpus actual planner inputs: initial, refinement and explicit successor')
    for (const test of spec.tests) for (const result of test.results) cases.push(result);
  for (const child of suite.suites ?? []) visit(child);
}
visit(results); assert.equal(cases.length, 1, 'One original native pair');
assert.ok(cases[0].status === 'passed' || cases[0].status === 'failed' && failedMode === '--allow-failed-comparison',
  'Failed original requires explicit diagnostic-only comparison option');
const attachment = name => {
  const rows = cases[0].attachments.filter(a => a.name === name); assert.equal(rows.length, 1, name);
  return JSON.parse(Buffer.from(rows[0].body, 'base64'));
};
const pair = attachment('planner-pair-raw.json'), source = attachment('native-decision-service-proof.json');
let custody, custodyProof;
if (mode === '--causal') {
  const bytes = readFileSync(custodyFile), file = JSON.parse(bytes);
  assert.equal(file.version, 1);
  assert.equal(file.contentHash, 'sha256:' + createHash('sha256').update(canonical(file.payload)).digest('hex'), 'Custody ledger digest');
  custody = file.payload.entries; custodyProof = { path: resolve(custodyFile), sha256: createHash('sha256').update(bytes).digest('hex') };
}
const comparison = mode === '--causal' ? compareCausalPublicWire(pair.roots, source.wire, custody) : comparePublicWire(pair.roots, source.wire);
let status = 'PASS', error;
try { (mode === '--causal' ? assertCausalPublicWireDisclosure : assertPublicWireDisclosure)(comparison); } catch (cause) { status = 'FAIL'; error = cause.message; }
const report = { status, input: resolve(input), inputSha256: createHash('sha256').update(bytes).digest('hex'),
  originalStats: results.stats, originalCaseStatus: cases[0].status,
  mode: mode === '--causal' ? 'bounded-correspondence' : 'strict-ordered', custodyProof, error, ...comparison };
mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status, originalCaseStatus: cases[0].status, output: resolve(output), counts: comparison.raw.map(r => ({
  sent: r.sent.length, received: r.received.length, progress: r.progress.length })), differences: comparison.differences.length,
  beforeDisclosure: comparison.differences.filter(d => !d.path.startsWith('/sent/8/payload/observation/data/frontiers/')),
  correspondence: comparison.correspondence?.blocks }, null, 2));
if (status === 'FAIL') process.exitCode = 1;
