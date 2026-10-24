import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safePath, sha256, serialize } from './import-tilelab-pack.ts';
import { canonicalResource, minecraftParts, resolveMinecraftModel } from '../src/assets3d/models/minecraft.ts';
import { nativeLever, nativeMaterials } from '../src/assets3d/models/native.ts';
import { validateVisualAsset, validateModelPack } from '../src/assets3d/models/contract.ts';
import type { ModelPack, VisualAsset, VisualMaterial } from '../src/assets3d/models/contract.ts';

export interface ModelSelection {
  schema: 'maze-model-selection-v1'; run: string;
  abstractRoot: 'minecraft:block/block:geometry-only-v1';
  variant: 'source_native' | 'upgraded';
  blocks: Record<string, { evidenceSha256: string; images: Record<string, string> }>;
  review: string;
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function dimensions(bytes: Buffer): [number, number] {
  check(bytes.length > 32 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
    bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND', 'Invalid/incomplete PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
export async function importModelProof(root: string, selection: ModelSelection) {
  check(selection.schema === 'maze-model-selection-v1' && path.basename(root) === selection.run &&
    selection.abstractRoot === 'minecraft:block/block:geometry-only-v1' && ['source_native', 'upgraded'].includes(selection.variant), 'Invalid model selection/run/profile');
  const pack: ModelPack = { schema: 'maze-visual-model-pack-v1', revision: '', assets: {}, materials: { ...nativeMaterials }, bindings: {},
    provenance: { source: selection.run, review: selection.review, warnings: [] } };
  const files = new Map<string, Buffer>();
  const data: Record<string, { models: Record<string, any>; variants: Record<string, any>; slots: Record<string, string>; evidence: any }> = {};
  for (const [block, choice] of Object.entries(selection.blocks)) {
    const bytes = await readFile(await safePath(root, `${block}/model-source-references.json`));
    check(sha256(bytes) === choice.evidenceSha256, `Source evidence changed: ${block}`);
    const evidence = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    check(evidence.schema === 'tilelab-model-source-evidence-v1' && evidence.source.SourceBlock === block &&
      Array.isArray(evidence.source.Files) && evidence.source.Files.length <= 256 && Array.isArray(evidence.textureResources), `Invalid model evidence: ${block}`);
    const models: Record<string, any> = {}; let variants: Record<string, any> = {};
    for (const source of evidence.source.Files) {
      const snapshot = await readFile(await safePath(root, `${block}/${source.Snapshot}`));
      check(sha256(snapshot) === source.Sha256, `Source JSON changed: ${source.Snapshot}`);
      const value = JSON.parse(snapshot.toString('utf8').replace(/^\uFEFF/, ''));
      if (source.Snapshot.startsWith('source-models/models/')) models[canonicalResource(source.Resource)] = value;
      else if (source.Snapshot === `source-models/blockstates/${block}.json`) variants = value.variants ?? {};
    }
    const slots: Record<string, string> = {};
    for (const resource of evidence.textureResources) {
      check(resource.uvPolicy === 'full_canvas_no_packing_no_seam_repair' &&
        resource.alphaPolicy === 'exact_source_alpha_at_nearest_source_texel', `Unsupported canvas policy: ${resource.resource}`);
      const relative = selection.variant === 'source_native' ? resource.original : resource.upgraded;
      check(relative && relative.endsWith(selection.variant === 'source_native' ? '/source_native.png' : '/upgraded.png'), `Selected ${selection.variant} not complete: ${resource.resource}`);
      const image = await readFile(await safePath(root, `${block}/${relative}`)), hash = sha256(image);
      check(choice.images[resource.resource] === hash, `Selected image changed: ${resource.resource}`);
      if (selection.variant === 'source_native') check(hash === resource.sourceSha256, `Original source changed: ${resource.resource}`);
      else throw new Error('Upgraded intake requires the verified TileLab material-export descriptor and alpha evidence; original-only proof is available now.');
      const [width, height] = dimensions(image);
      check(width === height && width <= 4096, `Unsupported canvas dimensions: ${resource.resource}`);
      const slot = resource.materialId, id = `source-${sha256(resource.resource).slice(0, 12)}`;
      const layoutId = `mc-uv16:${resource.resource}:${resource.sourceSha256}`;
      const material: VisualMaterial = { id, label: resource.resource, layoutId, surface: 'uv-atlas',
        texture: { path: `textures/${hash}.png`, sha256: hash, width, height }, fallbackColor: '#849099', roughness: 0.75,
        render: { alphaMode: 'mask', alphaCutoff: 0.5, side: 'front' } };
      if (pack.materials[id]) check(serialize(pack.materials[id]) === serialize(material), `Conflicting shared material: ${resource.resource}`);
      pack.materials[id] = material; files.set(material.texture!.path, image); slots[resource.resource] = slot;
    }
    pack.provenance.warnings.push(...evidence.source.Warnings.map((warning: string) => `${block}: ${warning}`));
    data[block] = { models, variants, slots, evidence };
  }
  const lever = data.lever, door = data.iron_door; check(lever && door, 'Lever and iron_door selections are required');
  const definitions = (block: typeof lever) => Object.fromEntries(Object.entries(block.slots).map(([resource, slot]) => {
    const material = pack.materials[`source-${sha256(resource).slice(0, 12)}`]; return [slot, { layoutId: material.layoutId }];
  }));
  const sources = (block: typeof lever): VisualAsset['source'] => ({ kind: 'minecraft-elements',
    note: 'Curated local BDcraft-derived source snapshots. Geometry-only abstract root exception; no Minecraft runtime. Original source credits retained in TileLab snapshots.',
    files: block.evidence.source.Files.map((f: any) => ({ path: f.Snapshot, sha256: f.Sha256 })) });
  const sourceLever: VisualAsset = { id: 'lever-wall-source', label: 'Wall lever · imported', geometryRevision: '', source: sources(lever),
    slots: definitions(lever), adapter: 'cuboids-v1', states: {}, anchors: { mount: { position: [0, 0, -0.5] } }, payload: { geometries: {} } };
  for (const [state, powered] of [['off', 'false'], ['on', 'true']]) {
    const variant = lever.variants[`face=wall,facing=south,powered=${powered}`]; check(variant, `Missing approved lever state: ${state}`);
    check(!variant.uvlock, 'UV lock is outside the selected adapter profile');
    const model = resolveMinecraftModel(canonicalResource(variant.model), lever.models, true);
    sourceLever.payload.geometries[state] = [{ id: 'source-frame', position: [0, 0, 0], rotation: [-(variant.x ?? 0) * Math.PI / 180, -(variant.y ?? 0) * Math.PI / 180, 0] },
      ...minecraftParts(model, lever.slots, { prefix: 'element', parent: 'source-frame' })];
    sourceLever.states[state] = { geometry: state };
  }
  sourceLever.geometryRevision = sha256(serialize({ payload: sourceLever.payload, states: sourceLever.states, source: sourceLever.source }));
  const sourceDoor: VisualAsset = { id: 'iron-door-source', label: 'Iron door · composite', geometryRevision: '', source: sources(door),
    slots: definitions(door), adapter: 'cuboids-v1', states: { closed: { geometry: 'door' }, open: { geometry: 'door', poses: { hinge: [0, -Math.PI / 2, 0] } } },
    anchors: { hinge: { position: [-0.5, 0, 0] }, top: { position: [0, 2, 0] } }, payload: { geometries: { door: [
      { id: 'hinge', position: [-0.5, 0, 0] }, { id: 'source-frame', parent: 'hinge', position: [0, 0, 0], rotation: [0, Math.PI / 2, 0] },
      ...minecraftParts(resolveMinecraftModel('minecraft:block/iron_door_bottom_left', door.models, true), door.slots, { prefix: 'lower', parent: 'source-frame', origin: [0, 0, 0] }),
      ...minecraftParts(resolveMinecraftModel('minecraft:block/iron_door_top_left', door.models, true), door.slots, { prefix: 'upper', parent: 'source-frame', origin: [0, 0, 0], offset: [0, 1, 0] }),
    ] } } };
  sourceDoor.geometryRevision = sha256(serialize({ payload: sourceDoor.payload, states: sourceDoor.states, source: sourceDoor.source }));
  for (const asset of [sourceLever, sourceDoor, nativeLever()]) {
    validateVisualAsset(asset); pack.assets[asset.id] = asset;
    pack.bindings[asset.id] = Object.fromEntries(Object.entries(asset.slots).map(([slot, layout]) => {
      const material = Object.values(pack.materials).find(m => m.layoutId === layout.layoutId);
      check(material, `No material for ${asset.id}/${slot}`); return [slot, material.id];
    }));
  }
  pack.bindings['lever-wall-native'] = { mount: 'native_stone', handle: 'native_bronze' };
  pack.revision = sha256(serialize(pack));
  validateModelPack(pack);
  return { pack, files };
}
async function main() {
  const args = process.argv.slice(2), option = (name: string) => args[args.indexOf(name) + 1];
  check(args.includes('--source') && args.includes('--selection'), 'Use --source RUN --selection JSON [--write]');
  const selection: ModelSelection = JSON.parse(await readFile(option('--selection'), 'utf8'));
  const { pack, files } = await importModelProof(path.resolve(option('--source')), selection);
  if (args.includes('--write')) {
    const destination = path.resolve('public/assets/model-packs/interactables'); await mkdir(destination, { recursive: true });
    for (const [relative, bytes] of files) { const file = await safePath(destination, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
    const temporary = await safePath(destination, `manifest-${process.pid}.tmp`);
    await writeFile(temporary, serialize(pack)); await rename(temporary, await safePath(destination, 'manifest.json'));
  }
  console.log(JSON.stringify({ revision: pack.revision, assets: Object.keys(pack.assets), materialCount: Object.keys(pack.materials).length,
    selection: selection.variant, write: args.includes('--write'), warnings: pack.provenance.warnings }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
