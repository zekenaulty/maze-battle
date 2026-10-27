import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { safePath, sha256, serialize } from './import-tilelab-pack.ts';
import { decodeModelPng } from './model-png.ts';
import { validateModelPack, type ModelPack } from '../src/assets3d/models/contract.ts';
const args = process.argv.slice(2), option = (key: string) => args[args.indexOf(key) + 1];
if (!args.includes('--source') || !args.includes('--selection')) throw Error('Use --source RUN --selection JSON [--write]');
const root = path.resolve(option('--source')), selection = JSON.parse(await readFile(option('--selection'), 'utf8'));
if (selection.schema !== 'maze-stage-detail-selection-v1' || selection.run !== path.basename(root) || selection.textures.length !== 2) throw Error('Explicit detail texture selection required');
const pack: ModelPack = { schema: 'maze-visual-model-pack-v1', revision: '', assets: {}, bindings: {}, materials: {}, provenance: {
  source: selection.run, review: selection.review, warnings: ['Optional face treatments, not new stair support/collision geometry. Original generation receipts retained.'] } };
const files = new Map<string, Buffer>();
for (const choice of selection.textures) {
  const bytes = await readFile(await safePath(root, choice.image)), report = await readFile(await safePath(root, choice.report));
  if (!['riser', 'metal'].includes(choice.role) || pack.materials[choice.role] || sha256(bytes) !== choice.sha256 || sha256(report) !== choice.reportSha256 || bytes.length > 16 * 1024 ** 2) throw Error('Changed/invalid detail source');
  const image = decodeModelPng(bytes), texture = { path: `textures/${choice.sha256}.png`, sha256: choice.sha256, width: image.width, height: image.height };
  pack.materials[choice.role] = { id: choice.role, label: choice.role, layoutId: 'stair-face-bands-v1/' + choice.role, surface: 'bounded-face', texture,
    fallbackColor: choice.role === 'metal' ? '#69584b' : '#6a6258', roughness: choice.role === 'metal' ? .65 : 1, render: { alphaMode: 'opaque', side: 'front' } };
  files.set(texture.path, bytes); files.set(`evidence/${choice.role}/report.json`, report);
}
files.set('evidence/selection.json', Buffer.from(serialize(selection))); pack.revision = sha256(serialize(pack)); validateModelPack(pack);
if (args.includes('--write')) {
  const destination = path.resolve('public/assets/model-packs/stage-details');
  await mkdir(destination, { recursive: true });
  for (const [relative, bytes] of files) { const file = await safePath(destination, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
  const pending = path.join(destination, 'manifest.json.pending');
  await writeFile(pending, serialize(pack)); await rename(pending, path.join(destination, 'manifest.json'));
}
console.log(JSON.stringify({ revision: pack.revision, materials: Object.keys(pack.materials), files: files.size, write: args.includes('--write') }, null, 2));
