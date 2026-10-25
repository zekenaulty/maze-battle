import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safePath, sha256, serialize } from './import-tilelab-pack.ts';
import { buildModelProof, dimensions, type ModelEvidenceBlock } from './import-model-proof.ts';
import { canonicalResource } from '../src/assets3d/models/minecraft.ts';
import { nativeMaterials } from '../src/assets3d/models/native.ts';
import type { ModelPack } from '../src/assets3d/models/contract.ts';

export interface ModelExportSelection {
  schema: 'maze-model-export-selection-v1'; descriptorSha256: string; revision: string;
  blocks: ['lever', 'iron_door']; variant: 'source_native';
  abstractRoot: 'minecraft:block/block:geometry-only-v1'; review: string;
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw Error(message); }
const json = (b: Buffer) => JSON.parse(b.toString('utf8').replace(/^\uFEFF/, ''));
/** Offline portable intake. Never follows historical absolute paths or selects unrequested artwork. */
export async function importModelExport(root: string, selection: ModelExportSelection) {
  check(selection.schema === 'maze-model-export-selection-v1' && selection.variant === 'source_native'
    && selection.abstractRoot === 'minecraft:block/block:geometry-only-v1'
    && serialize(selection.blocks) === serialize(['lever', 'iron_door']), 'Unsupported export selection; this proof explicitly selects original lever/door materials');
  const descriptor = await readFile(await safePath(root, 'material-export.json'));
  check(sha256(descriptor) === selection.descriptorSha256, 'Material-export descriptor changed');
  const doc = json(descriptor);
  check(doc.schema === 'tilelab-material-export-v1' && doc.revision === selection.revision && doc.selectionStatus === 'complete'
    && doc.colorSpace === 'srgb' && doc.alphaPolicy === 'exact_source_alpha_at_nearest_source_texel'
    && doc.uvBasis?.units === 16 && doc.uvBasis.origin === 'top-left' && doc.uvBasis.mapping === 'full-canvas'
    && doc.uvBasis.policy === 'full_canvas_no_packing_no_seam_repair' && doc.uvBasis.layoutIdentityAuthority === 'consumer'
    && Array.isArray(doc.files) && doc.files.length <= 512 && Array.isArray(doc.blocks) && doc.blocks.length <= 64
    && Array.isArray(doc.materials) && doc.materials.length <= 128, 'Unsupported material-export policy or bounds');
  const verified = new Map<string, Buffer>();
  for (const pin of doc.files) {
    check(typeof pin.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256) && !verified.has(pin.path), 'Invalid/duplicate export file pin');
    const bytes = await readFile(await safePath(root, pin.path)); check(bytes.length <= 16 * 1024 ** 2 && sha256(bytes) === pin.sha256, `Export file changed: ${pin.path}`);
    verified.set(pin.path, bytes);
  }
  const pinned = (pin: any) => {
    const bytes = verified.get(pin?.path); check(bytes && sha256(bytes) === pin.sha256, `Unlisted or changed export reference: ${pin?.path}`); return bytes;
  };
  const pack: ModelPack = { schema: 'maze-visual-model-pack-v1', revision: '', assets: {}, materials: { ...nativeMaterials }, bindings: {},
    provenance: { source: `tilelab-export:${doc.revision}`, review: selection.review, warnings: [
      `Selected originals only; producer upgrade status: ${doc.upgradeStatus}. Rights: ${doc.rightsStatus}. Semantic UV review remains manual.`] } };
  const data: Record<string, ModelEvidenceBlock> = {}, files = new Map<string, Buffer>();
  for (const id of selection.blocks) {
    const block = doc.blocks.find((b: any) => b.id === id);
    check(block?.sourceBlock === id && Array.isArray(block.sourceFiles) && block.sourceFiles.length <= 256, `Missing selected block: ${id}`);
    pinned(block.blockMap); const audit = json(pinned(block.sourceReferences));
    check(audit.schema === 'tilelab-model-source-evidence-v1' && audit.source?.SourceBlock === id, 'Mismatched source evidence');
    const models: Record<string, any> = {}; let variants: Record<string, any> = {};
    for (const source of block.sourceFiles) {
      const file = source.file.path as string; check(file.startsWith(`evidence/blocks/${id}/source-models/`), 'Foreign source snapshot path');
      const value = json(pinned(source.file));
      if (file.includes('/source-models/models/')) models[canonicalResource(source.resource)] = value;
      else { check(file.endsWith(`/blockstates/${id}.json`), 'Unexpected source snapshot'); variants = value.variants ?? {}; }
    }
    const slots: Record<string, string> = {};
    for (const material of doc.materials.filter((m: any) => m.blocks?.includes(id))) {
      check(material.variant === selection.variant && material.materialIds.length === 1
        && ['binary_mask', 'opaque'].includes(material.source.alphaKind), `Selected original/alpha policy differs: ${material.resource}`);
      const original = pinned(material.source.image), image = pinned(material.selected), selected = material.selected;
      const [width, height] = dimensions(image);
      check(image.equals(original) && selected.width === material.source.image.width && selected.height === material.source.image.height
        && selected.width > 0 && selected.width <= 4096 && selected.width === selected.height
        && width === selected.width && height === selected.height, 'Original canvas or alpha was changed');
      const resource = canonicalResource(material.resource), key = `source-${sha256(resource).slice(0, 12)}`;
      const definition = { id: key, label: resource, layoutId: `mc-uv16:${resource}:${material.source.image.sha256}`,
        surface: 'uv-atlas' as const, texture: { path: `textures/${selected.sha256}.png`, sha256: selected.sha256, width: selected.width, height: selected.height },
        fallbackColor: '#849099', roughness: .75, render: { alphaMode: 'mask' as const, alphaCutoff: .5, side: 'front' as const } };
      if (pack.materials[key]) check(serialize(pack.materials[key]) === serialize(definition), 'Conflicting shared resource');
      pack.materials[key] = definition; slots[resource] = material.materialIds[0]; files.set(definition.texture.path, image);
    }
    check(Object.keys(slots).length > 0, `No selected resources for ${id}`);
    data[id] = { models, variants, slots, evidence: { source: { Files: block.sourceFiles.map((s: any) => ({ Snapshot: s.file.path, Sha256: s.file.sha256 })) } } };
    pack.provenance.warnings.push(...block.warnings.map((s: string) => `${id}: ${s}`), ...block.credits.map((s: string) => `${id} credit: ${s}`));
  }
  return { ...buildModelProof(data, pack, files), verifiedFiles: verified.size };
}
async function main() {
  const args = process.argv.slice(2), option = (name: string) => args[args.indexOf(name) + 1];
  check(args.includes('--source') && args.includes('--selection'), 'Use --source EXPORT_FOLDER --selection JSON [--write]');
  const selection = json(await readFile(option('--selection'))), { pack, files, verifiedFiles } = await importModelExport(path.resolve(option('--source')), selection);
  if (args.includes('--write')) {
    const destination = path.resolve('public/assets/model-packs/interactables'); await mkdir(destination, { recursive: true });
    for (const [relative, bytes] of files) { const file = await safePath(destination, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
    const temporary = await safePath(destination, `manifest-${process.pid}.tmp`); await writeFile(temporary, serialize(pack)); await rename(temporary, await safePath(destination, 'manifest.json'));
  }
  console.log(JSON.stringify({ revision: pack.revision, verifiedFiles, assets: Object.keys(pack.assets), variant: selection.variant, write: args.includes('--write') }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
