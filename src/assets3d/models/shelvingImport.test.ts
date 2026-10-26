// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { importShelving, type ShelvingSelection } from '../../../scripts/import-shelving';
import { serialize, sha256 } from '../../../scripts/import-tilelab-pack';
import { pngImage } from './modelExport.test-support';
const temporary: string[] = [];
afterEach(async () => { for (const p of temporary.splice(0)) await rm(p, { recursive: true, force: true }); });
async function fixture(change?: (pack: any, placement: any) => void) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'maze-shelving-')); temporary.push(root); const directory = path.join(root, 'case'); await mkdir(directory);
  const png = pngImage({ width: 2, height: 2, rgba: Buffer.alloc(16, 255) }), digest = sha256(png), texturePath = `textures/${digest}.png`;
  const mesh = { slot: 'wood', positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]], uvs: [[0, 1], [2, 1], [0, 0]], indices: [0, 1, 2] };
  const bounds = { min: [0, 0, -.1], max: [1, 1, .1] };
  const pack: any = { schema: 'maze-visual-model-pack-v1', revision: 'source-pack', provenance: { source: 'offline fixture', review: 'unreviewed', warnings: [] },
    assets: { case: { id: 'case', label: 'offline case', geometryRevision: 'geometry', source: { kind: 'tilelab-construction', note: 'offline' }, adapter: 'surface-parts-v1',
      slots: { wood: { layoutId: 'source-world-uv' } }, placement: { bounds, clearances: [] }, states: { default: { geometry: 'main' } },
      payload: { geometries: { main: [{ id: 'board', position: [0, 0, 0], mesh }] } } } },
    materials: { wood: { id: 'wood', label: 'wood', layoutId: 'source-world-uv', texture: { path: texturePath, sha256: digest, width: 2, height: 2 },
      surface: 'tileable', fallbackColor: '#49331e', roughness: 1, render: { alphaMode: 'opaque', side: 'front' } } }, bindings: { case: { wood: 'wood' } } };
  const placement: any = { schema: 'tilelab-shelving-placement-v1', assetId: 'case', packRevision: pack.revision, fillBounds: bounds,
    transform: { appliedOnce: true, target: 'consumer-instance-local' }, proportions: { avatarHeightWorld: 2.7, ordinaryBookMaxHeightWorld: .4 }, storageSlots: [], joints: [] };
  change?.(pack, placement);
  const geometry = { schema: 'tilelab-geometry-candidate-v1', status: 'preview', runtimeAdmission: 'consumer-owned', basis: { handedness: 'right', units: 'blocks', x: 'right', y: 'up', z: 'front' },
    bounds, clearances: [], anchors: [], materials: { wood: {} }, meshes: [{ ...mesh, id: 'board', material: 'wood', solid: false }], context: { meshes: ['never render me'] } };
  const files = new Map([['manifest.json', Buffer.from(serialize(pack))], ['placement.json', Buffer.from(serialize(placement))], ['geometry.json', Buffer.from(serialize(geometry))], [texturePath, png]]);
  const doc = { schema: 'tilelab-workshop-v1', stage: 'export', admission: 'preview-only', review: 'unreviewed', revision: 'package', files: [...files].map(([p, b]) => ({ path: p, sha256: sha256(b) })) };
  const descriptor = Buffer.from(serialize(doc)); files.set('workshop.json', descriptor);
  for (const [relative, bytes] of files) { const dest = path.join(directory, relative); await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, bytes); }
  const selection: ShelvingSelection = { schema: 'maze-shelving-selection-v1', producerCommit: 'offline', review: 'offline selected fixture', packages: [{ directory: 'case', assetId: 'case', revision: 'package', workshopSha256: sha256(descriptor),
    manifestSha256: sha256(files.get('manifest.json')!), placementSha256: sha256(files.get('placement.json')!) }] };
  return { root, directory, selection, pack, files, texturePath };
}
it('imports existing world coordinates/UVs and exact PNG bytes, retaining placement metadata without context meshes', async () => {
  const f = await fixture(), result = await importShelving(f.root, f.selection);
  expect(result.pack.assets.case).toEqual(f.pack.assets.case);
  expect(result.pack.bindings.case.wood).toBe('case-wood'); expect(result.files.get(f.texturePath)).toEqual(f.files.get(f.texturePath));
  expect(result.files.has('placement.json')).toBe(true); expect(result.pack.assets.case.payload.geometries.main).toHaveLength(1);
  const second = await importShelving(f.root, f.selection); expect(second.pack).toEqual(result.pack);
  const moved = path.join(f.root, 'portable'); await cp(f.directory, path.join(moved, 'case'), { recursive: true }); expect((await importShelving(moved, f.selection)).pack).toEqual(result.pack);
});
it('rejects a source payload changed after selection', async () => {
  const f = await fixture(); await writeFile(path.join(f.directory, 'geometry.json'), '{}'); await expect(importShelving(f.root, f.selection)).rejects.toThrow('changed/oversized payload');
});
it.each(['identity', 'double conversion', 'outside envelope', 'texture dimensions', 'oversized books'])('refuses a fully repinned package with incompatible %s', async fault => {
  const f = await fixture((pack, placement) => {
    if (fault === 'identity') placement.assetId = 'other';
    if (fault === 'double conversion') placement.transform.appliedOnce = false;
    if (fault === 'outside envelope') placement.fillBounds = { min: [0, 0, 0], max: [.5, .5, .05] };
    if (fault === 'texture dimensions') pack.materials.wood.texture.width = 4;
    if (fault === 'oversized books') placement.proportions.ordinaryBookMaxHeightWorld = 1.2;
  });
  await expect(importShelving(f.root, f.selection)).rejects.toThrow(/Shelving intake/);
});
