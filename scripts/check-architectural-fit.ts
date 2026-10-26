import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CELL_SIZE, DOOR_HEIGHT, DOOR_WIDTH, WALL_HEIGHT } from '../src/components/maze3d/constants.ts';
import { intersectsClearance, validateWorkshopGeometry } from './workshop-geometry.ts';

type V = [number, number, number];
export interface FitContext { cellWidth: number; wallHeight: number; doorWidth: number; doorHeight: number }
export const currentFitContext: FitContext = { cellWidth: CELL_SIZE, wallHeight: WALL_HEIGHT, doorWidth: DOOR_WIDTH, doorHeight: DOOR_HEIGHT };
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const POSITION_TOLERANCE = 1e-6; // World units for this diagnostic; not a runtime-wide contract.

/** Numeric preflight only: floor-centered, axis-aligned, uniform positive scale, one-cell opening. */
export function architecturalFit(geometry: any, scale: number, context: FitContext = currentFitContext) {
  if (!Number.isFinite(scale) || scale <= 0) throw Error('Explicit positive world-units-per-authoring-unit required');
  if (!Object.values(context).every(n => Number.isFinite(n) && n > 0)
    || context.doorWidth > context.cellWidth || context.doorHeight > context.wallHeight) throw Error('Invalid consumer dimensions');
  const localProof = validateWorkshopGeometry(geometry);
  if (geometry.basis.origin !== 'floor-center') throw Error('Unsupported pivot: requires declared floor-center origin');
  const bounds = { min: geometry.bounds.min.map((n: number) => n * scale) as V,
    max: geometry.bounds.max.map((n: number) => n * scale) as V };
  // Pull the canonical aperture back into authoring coordinates, applying conversion once.
  // Test the entire surround depth; this is an aperture test, not a guessed door thickness/sweep.
  const aperture = { min: [-context.doorWidth / 2 / scale, 0, geometry.bounds.min[2]] as V,
    max: [context.doorWidth / 2 / scale, context.doorHeight / scale, geometry.bounds.max[2]] as V };
  const obstructingSolids = geometry.meshes.filter((m: any) => m.solid && intersectsClearance(m, aperture)).map((m: any) => m.id);
  const errors = {
    aboveWall: Math.max(0, bounds.max[1] - context.wallHeight),
    outsideCell: Math.max(0, -context.cellWidth / 2 - bounds.min[0], bounds.max[0] - context.cellWidth / 2),
    floorOffset: Math.abs(bounds.min[1]),
  };
  const failures: string[] = [];
  if (obstructingSolids.length) failures.push('candidate solid intersects canonical door aperture');
  if (errors.aboveWall > POSITION_TOLERANCE) failures.push('candidate exceeds current wall height');
  if (errors.outsideCell > POSITION_TOLERANCE) failures.push('candidate exceeds single-cell lateral envelope');
  if (errors.floorOffset > POSITION_TOLERANCE) failures.push('candidate does not meet finished floor');
  return {
    schema: 'maze-architectural-fit-preflight-v1', assetId: geometry.assetId,
    numericStatus: failures.length ? 'FAIL' : 'PASS', gameAdmission: 'UNVERIFIED',
    transform: { source: 'TileLab authoring-local blocks', target: 'Maze Battle opening-local world units',
      origin: 'common floor center', axes: 'X right, Y up, Z front', worldUnitsPerAuthoringUnit: scale,
      rotation: 'identity', translation: [0, 0, 0], policy: 'single-cell surround; no structural replacement' },
    consumerDimensions: { ...context }, localProof, worldBounds: bounds,
    measuredErrorsWorldUnits: errors, obstructingSolids, failures,
    tolerances: { positionWorldUnits: POSITION_TOLERANCE, convexContactAuthoringUnits: 1e-7 },
    unverified: ['full source package closure', 'real iron-door mesh and open/closed hinge sweep',
      'composed room/wall joints and stair/floor stacking', 'UV phase and shading',
      'browser rendering', 'canonical traversal, saved scenes and admission decision'],
  };
}

async function main(args: string[]) {
  const allowed = ['--geometry', '--sha256', '--world-units-per-authoring-unit'];
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || !args[i + 1] || options.has(args[i])) throw Error('Use --geometry FILE --sha256 HASH --world-units-per-authoring-unit NUMBER');
    options.set(args[i], args[i + 1]);
  }
  if (options.size !== allowed.length || !/^[a-f0-9]{64}$/.test(options.get('--sha256') ?? '')) throw Error('Explicit geometry, lowercase SHA-256 pin and unit conversion required');
  const source = path.resolve(options.get('--geometry')!);
  if ((await stat(source)).size > 4 * 1024 ** 2) throw Error('Geometry diagnostic limit is 4 MiB');
  const bytes = await readFile(source), hash = digest(bytes);
  if (hash !== options.get('--sha256')) throw Error('Candidate geometry hash differs from supplied pin');
  const result = architecturalFit(JSON.parse(bytes.toString('utf8')), Number(options.get('--world-units-per-authoring-unit')));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = (...gitArgs: string[]) => execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ ...result, evidence: { geometrySha256: hash,
    consumerCommit: git('rev-parse', 'HEAD'), consumerBranch: git('branch', '--show-current'),
    dirtyScope: git('status', '--short'), constantsSha256: digest(await readFile(new URL('../src/components/maze3d/constants.ts', import.meta.url))),
    diagnosticSha256: digest(await readFile(fileURLToPath(import.meta.url))),
    convexValidatorSha256: digest(await readFile(new URL('./workshop-geometry.ts', import.meta.url))) } }, null, 2));
  if (result.numericStatus === 'FAIL') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
}
