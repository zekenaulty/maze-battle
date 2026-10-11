import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const evidence = JSON.parse(readFileSync('docs/evidence/d1/measurements.json'));
const hashFiles = files => {
  const hash = createHash('sha256');
  for (const path of files) hash.update(path).update(readFileSync(path));
  return hash.digest('hex');
};
const files = execFileSync('git', ['ls-files', 'src', 'package.json', 'package-lock.json'], { encoding: 'utf8' }).trim().split(/\r?\n/);
assert.equal(hashFiles(files), evidence.sourceSha256, 'Product source drift');
assert.equal(hashFiles(evidence.harnessFiles), evidence.harnessSha256, 'Measurement harness drift');
assert.equal(evidence.sourceUnchanged, true);
const domain = evidence.cohorts.find(cohort => cohort.cohort === 'domain');
assert.equal(domain.errors.length, 0);
assert.equal(domain.rows.length, 26);
const floors = domain.rows.filter(row => row.structural);
assert.equal(floors.length, 16);
for (const row of floors) {
  assert.ok(['complete', 'partial'].includes(row.status));
  assert.equal(row.structural.rooms, row.budget);
  assert.equal(row.structural.allCentersReachable, true);
  assert.ok(row.structural.projectionCells <= 65536);
  assert.equal(row.persistence.preservedAllFloorMazes, true);
  assert.equal(row.persistence.activeMazeBytes, row.persistence.activeFloorDuplicateMazeBytes);
  assert.ok(row.persistence.fullGameStateBytes > row.persistence.activeMazeBytes * 2);
  assert.equal(row.traversal.battle, false);
  assert.equal(row.traversal.openedChests, 0);
  assert.equal(row.traversal.geometryPreserved, true);
  assert.ok(row.traversal.moves <= 1024);
  assert.ok(row.traversal.routes.every(route => route.stepsCompleted <= route.distance));
  assert.equal(row.traversal.routes.filter(route => route.arrived).length, row.traversal.reached);
  if (row.status === 'complete') assert.equal(row.traversal.reached, row.traversal.targets);
  assert.ok(row.work.physicalIndexReads.queries >= row.work.committedProposalCounters.occupancyQueries);
}
for (const budget of [32, 128]) {
  const rows = domain.rows.filter(row => row.constructedArchiveNotStairsProof && row.budget === budget);
  assert.deepEqual(rows.map(row => row.count), [1, 2, 4, 8, 16]);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].status, 'complete');
    assert.equal(rows[i].persistence.preservedAllFloorMazes, true);
    if (i) assert.ok(rows[i].persistence.fullGameStateBytes > rows[i - 1].persistence.fullGameStateBytes);
  }
}
const render = evidence.cohorts.find(cohort => cohort.cohort === 'render');
assert.equal(render.status, 'complete');
assert.equal(render.rows.length, 8);
for (const row of render.rows) {
  assert.equal(row.status, 'complete');
  assert.equal(row.modes.length, 4);
  assert.equal(row.blockedRequests.length + row.pageErrors.length + row.assetFailures.length, 0);
  assert.equal(row.cells, floors.find(floor => floor.seed === row.seed && floor.budget === row.budget).structural.projectionCells);
  for (const mode of row.modes) {
    assert.equal(mode.synchronousDrawMs.length, 7);
    assert.equal(mode.drawPlusReadbackMs.length, 7);
    assert.ok(mode.litPixels >= 10);
  }
}
const initial = JSON.parse(readFileSync('docs/evidence/d1/measurements-initial.json'));
for (const row of floors) assert.equal(row.geometrySha256,
  initial.cohorts[0].rows.find(previous => previous.id === row.id).geometrySha256, 'Geometry changed across rerun');
console.log(`PASS: source/harness hashes; 16 projection/reload fixtures; 10 archives; 32 render modes; repeat geometry hashes.`);
console.log(`Traversal coverage: ${floors.filter(row => row.traversal.status === 'complete').length}/16 complete, ${floors.filter(row => row.traversal.status !== 'complete').length} bounded. This verifier does not promote partial coverage to PASS.`);
