import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safePath, sha256, serialize } from './import-tilelab-pack.ts';
import { decodeModelPng } from './model-png.ts';
import { validateWorkshopGeometry } from './workshop-geometry.ts';
import { validateModelPack, type ModelPack } from '../src/assets3d/models/contract.ts';

export interface ShelvingSelection { schema: 'maze-shelving-selection-v1'; review: string; producerCommit: string;
  packages: Array<{ directory: string; assetId: string; workshopSha256: string; manifestSha256: string; placementSha256: string; revision: string }> }
const json = (b: Buffer) => JSON.parse(b.toString('utf8').replace(/^\uFEFF/, ''));
function check(ok: unknown, message: string): asserts ok { if (!ok) throw Error('Shelving intake: ' + message); }
/** Native consumer packs already contain the unit and V-axis conversions. Never convert twice. */
export async function importShelving(root: string, selection: ShelvingSelection) {
  check(selection.schema === 'maze-shelving-selection-v1' && selection.review && selection.packages.length > 0 && selection.packages.length <= 5, 'explicit bounded selection required');
  const pack: ModelPack = { schema: 'maze-visual-model-pack-v1', revision: '', assets: {}, materials: {}, bindings: {},
    provenance: { source: 'TileLab selected shelving-v3', review: selection.review, warnings: ['Visual furnishings only; storage bays and cabinet poses do not grant inventory/action authority.', 'Original artwork/provenance retained unchanged in evidence.'] } };
  const files = new Map<string, Buffer>(), placements: Record<string, unknown> = {};
  for (const choice of selection.packages) {
    check(/^[a-z][a-z0-9-]*$/.test(choice.directory) && !pack.assets[choice.assetId], 'duplicate/invalid selection');
    const directory = await safePath(root, choice.directory), descriptor = await readFile(await safePath(directory, 'workshop.json'));
    check(sha256(descriptor) === choice.workshopSha256, 'workshop descriptor changed'); const doc = json(descriptor);
    check(doc.schema === 'tilelab-workshop-v1' && doc.stage === 'export' && doc.admission === 'preview-only' && doc.review === 'unreviewed'
      && doc.revision === choice.revision && Array.isArray(doc.files) && doc.files.length <= 128, 'unsupported package stage/bounds');
    const pins = new Map<string, Buffer>(); let total = 0;
    for (const pin of doc.files) {
      check(typeof pin.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256) && !pins.has(pin.path), 'invalid/duplicate payload pin');
      const bytes = await readFile(await safePath(directory, pin.path)); total += bytes.length;
      check(bytes.length <= 16 * 1024 ** 2 && total <= 64 * 1024 ** 2 && sha256(bytes) === pin.sha256, 'changed/oversized payload ' + pin.path);
      pins.set(pin.path, bytes); files.set(`evidence/${choice.directory}/${pin.path}`, bytes);
    }
    const pinned = (name: string) => { const b = pins.get(name); check(b, 'missing payload ' + name); return b; };
    const manifest = pinned('manifest.json'), placementBytes = pinned('placement.json');
    check(sha256(manifest) === choice.manifestSha256 && sha256(placementBytes) === choice.placementSha256, 'consumer manifest/placement changed');
    const source: ModelPack = json(manifest); validateModelPack(source);
    check(Object.keys(source.assets).length === 1 && source.assets[choice.assetId], 'selected asset identity differs');
    const asset = source.assets[choice.assetId], placement = json(placementBytes); validateWorkshopGeometry(json(pinned('geometry.json')));
    check(placement.schema === 'tilelab-shelving-placement-v1' && placement.assetId === asset.id && placement.packRevision === source.revision
      && placement.transform?.appliedOnce === true && placement.transform.target === 'consumer-instance-local'
      && asset.placement?.bounds.min.every((v, i) => v >= placement.fillBounds.min[i] - 1e-6 && asset.placement!.bounds.max[i] <= placement.fillBounds.max[i] + 1e-6), 'consumer frame/bounds differ: ' + choice.directory);
    check(Array.isArray(placement.storageSlots) && placement.storageSlots.length <= 32 && Array.isArray(placement.joints)
      && placement.proportions?.avatarHeightWorld === 2.7 && placement.proportions.ordinaryBookMaxHeightWorld < .5, 'unsupported shelving metadata');
    const binding: Record<string, string> = {};
    for (const [id, material] of Object.entries(source.materials)) {
      check(!material.animation, 'animated shelving not selected');
      if (material.texture) {
        const bytes = pinned(material.texture.path), image = decodeModelPng(bytes);
        check(sha256(bytes) === material.texture.sha256 && image.width === material.texture.width && image.height === material.texture.height, 'texture bytes/dimensions differ');
        files.set(material.texture.path, bytes);
      }
      const localId = choice.directory + '-' + id; pack.materials[localId] = { ...material, id: localId };
    }
    for (const [slot, id] of Object.entries(source.bindings[asset.id])) binding[slot] = choice.directory + '-' + id;
    pack.assets[asset.id] = asset; pack.bindings[asset.id] = binding; placements[asset.id] = placement;
    files.set(`evidence/${choice.directory}/workshop.json`, descriptor);
  }
  files.set('placement.json', Buffer.from(serialize({ schema: 'maze-shelving-placements-v1', assets: placements })));
  files.set('evidence/intake.json', Buffer.from(serialize({ selection, transformsPreserved: true, contextInstantiated: false, gameplayAdmission: false })));
  pack.revision = sha256(serialize(pack)); validateModelPack(pack); return { pack, files };
}
async function main() {
  const args = process.argv.slice(2), option = (key: string) => args[args.indexOf(key) + 1];
  check(args.includes('--source') && args.includes('--selection'), 'use --source ROOT --selection JSON [--write]');
  const result = await importShelving(path.resolve(option('--source')), json(await readFile(option('--selection'))));
  if (args.includes('--write')) {
    const destination = path.resolve('public/assets/model-packs/shelving'); await mkdir(destination, { recursive: true });
    for (const [relative, bytes] of result.files) { const file = await safePath(destination, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
    const tmp = await safePath(destination, `manifest-${process.pid}.tmp`); await writeFile(tmp, serialize(result.pack)); await rename(tmp, await safePath(destination, 'manifest.json'));
  }
  console.log(JSON.stringify({ revision: result.pack.revision, assets: Object.keys(result.pack.assets), files: result.files.size, write: args.includes('--write') }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
