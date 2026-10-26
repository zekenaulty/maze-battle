import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { architecturalFit, currentFitContext } from '../check-architectural-fit.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = new URL('../../tests/fixtures/architecture/independent-arch.geometry.json', import.meta.url);
const bytes = readFileSync(fixture), geometry = JSON.parse(bytes), pin = createHash('sha256').update(bytes).digest('hex');
const provenance = JSON.parse(readFileSync(new URL('../../tests/fixtures/architecture/provenance.json', import.meta.url)));
const copy = () => structuredClone(geometry);
const cli = (...args) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/check-architectural-fit.ts', ...args], { cwd: root, encoding: 'utf8' });

test('retained original independent arch has its recorded producer geometry pin', () => {
  assert.equal(pin, provenance.geometrySha256);
  assert.equal(geometry.assetId, provenance.assetId);
});

test('local-valid original arch obstructs the actual consumer aperture at unit scale', () => {
  const before = JSON.stringify(geometry), result = architecturalFit(geometry, 1);
  assert.equal(result.numericStatus, 'FAIL');
  assert.ok(result.localProof.meshes > 0);
  assert.ok(result.obstructingSolids.length > 0);
  assert.equal(result.consumerDimensions.doorWidth, currentFitContext.doorWidth);
  assert.equal(result.gameAdmission, 'UNVERIFIED');
  assert.equal(JSON.stringify(geometry), before);
});

test('existing 1.5 preview scale clears the aperture and taller wall but exceeds the cell envelope', () => {
  const result = architecturalFit(geometry, 1.5);
  assert.equal(result.numericStatus, 'FAIL');
  assert.equal(result.obstructingSolids.length, 0);
  assert.equal(result.measuredErrorsWorldUnits.aboveWall, 0);
  assert.ok(result.measuredErrorsWorldUnits.outsideCell > .4);
  assert.equal(result.gameAdmission, 'UNVERIFIED');
});

test('a passing limited preflight still carries unknown door swing and no admission', () => {
  const result = architecturalFit(geometry, 1.5, { cellWidth: 5, wallHeight: 6, doorWidth: 1.8, doorHeight: 3.3 });
  assert.equal(result.numericStatus, 'PASS');
  assert.equal(result.gameAdmission, 'UNVERIFIED');
  assert.ok(result.unverified.some(gate => gate.includes('hinge sweep')));
});

test('conversion must be explicit, positive and supported; unknown unit/pivot is refused', () => {
  for (const scale of [undefined, NaN, Infinity, 0, -1]) assert.throws(() => architecturalFit(geometry, scale));
  const unknown = copy(); unknown.basis.units = 'unknown'; assert.throws(() => architecturalFit(unknown, 1));
  const pivot = copy(); pivot.basis.origin = 'inferred-center'; assert.throws(() => architecturalFit(pivot, 1));
});

test('CLI binds actual candidate bytes and consumer evidence, returning 1 for measured failure', () => {
  const result = cli('--geometry', fileURLToPath(fixture), '--sha256', pin, '--world-units-per-authoring-unit', '1.5');
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.evidence.geometrySha256, pin);
  assert.match(report.evidence.consumerCommit, /^[a-f0-9]{40}$/);
  assert.match(report.evidence.constantsSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.gameAdmission, 'UNVERIFIED');
});

test('CLI fails closed for changed pins, omitted conversion and unsupported transform flags', () => {
  const common = ['--geometry', fileURLToPath(fixture), '--sha256', pin];
  assert.equal(cli('--geometry', fileURLToPath(fixture), '--sha256', '0'.repeat(64), '--world-units-per-authoring-unit', '1.5').status, 2);
  assert.equal(cli(...common).status, 2);
  assert.equal(cli(...common, '--world-units-per-authoring-unit', '1.5', '--rotation', '90').status, 2);
});
