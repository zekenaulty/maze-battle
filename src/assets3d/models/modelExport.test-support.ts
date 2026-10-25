import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { sha256 } from '../../../scripts/import-tilelab-pack';
import { pngCrc, alphaPlane, cropPixels, type PngPixels } from '../../../scripts/model-png';
import type { ModelExportSelection } from '../../../scripts/import-model-export';

export function pngImage(image: PngPixels) {
  const chunk = (type: string, body: Buffer) => {
    const data = Buffer.concat([Buffer.from(type), body]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(body.length); crc.writeUInt32BE(pngCrc(data)); return Buffer.concat([length, data, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(image.width); header.writeUInt32BE(image.height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y++) image.rgba.copy(raw, y * (image.width * 4 + 1) + 1, y * image.width * 4, (y + 1) * image.width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const control = 'minecraft:block/_bdc/switches', top = 'minecraft:block/iron_door_top', bottom = 'minecraft:block/iron_door_bottom';
export async function upgradedExportFixture(fault?: 'alpha' | 'crop' | 'receipt' | 'group' | 'fallback' | 'missing-receipt') {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'maze-upgraded-export-')), root = path.join(parent, 'portable');
  const pins: Array<{ path: string; sha256: string }> = [];
  const put = async (relative: string, bytes: Buffer | string) => {
    const file = path.join(root, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
    const pin = { path: relative, sha256: sha256(bytes) }; pins.push(pin); return pin;
  };
  const originals = new Map<string, PngPixels>(), outputs = new Map<string, PngPixels>();
  [control, top, bottom].forEach((resource, index) => {
    const alpha = index === 0 ? [0, 128, 255, 255] : index === 1 ? [255, 0, 255, 255] : [255, 255, 0, 255];
    const original = { width: 2, height: 2, rgba: Buffer.from(alpha.flatMap((a, pixel) => [index * 20 + pixel, 50, 90, a])) };
    const output = { width: 4, height: 4, rgba: Buffer.alloc(64) };
    for (let pixel = 0; pixel < 16; pixel++) output.rgba.set([100 + index * 30 + pixel, 90 + pixel, 45, alpha[Math.floor(pixel / 8) * 2 + Math.floor(pixel % 4 / 2)]], pixel * 4);
    originals.set(resource, original); outputs.set(resource, output);
  });
  const blocks: any[] = [], sources = new Map<string, any>(), materials: any[] = [];
  for (const resource of [control, top, bottom]) {
    const original = originals.get(resource)!, selected = outputs.get(resource)!, sourceBytes = pngImage(original);
    const unit = `${sha256(resource).slice(0, 12)}_${sha256(sourceBytes).slice(0, 16)}`;
    const sourceImage = { ...await put(`textures/${unit}/source_native.png`, sourceBytes), width: 2, height: 2 };
    sources.set(resource, { unit, original, selected, sourceImage });
  }
  for (const id of ['lever', 'iron_door', 'stone_button']) {
    const resources = id === 'iron_door' ? [bottom, top] : [control], files: any[] = [];
    const names = id === 'lever' ? ['_bdc/lever_wall', '_bdc/lever_wall_on'] : id === 'iron_door'
      ? ['iron_door_bottom_left', 'iron_door_top_left'] : ['stone_button', 'stone_button_pressed'];
    for (let index = 0; index < names.length; index++) {
      const resource = resources[index % resources.length], name = names[index];
      const value = { parent: 'block/block', textures: { surface: resource }, elements: [{ from: [5, 0, 6], to: [11, index ? 1 : 2, 10],
        faces: { south: { texture: '#surface', uv: [16, 0, 0, 16] } } }] };
      files.push({ resource: `minecraft:block/${name}`, file: await put(`evidence/blocks/${id}/source-models/models/block/${name}.json`, JSON.stringify(value)) });
    }
    const variants = { 'face=wall,facing=south,powered=false': { model: `block/${names[0]}`, x: 90, y: 180 },
      'face=wall,facing=south,powered=true': { model: `block/${names[1]}`, x: 90, y: 180 } };
    files.push({ resource: `minecraft:${id}`, file: await put(`evidence/blocks/${id}/source-models/blockstates/${id}.json`, JSON.stringify({ variants })) });
    const audit = { schema: 'tilelab-model-source-evidence-v1', source: { SourceBlock: id, AbsoluteHistoricalPath: 'Z:/unavailable/authoring',
      Files: files.map(s => ({ Resource: s.resource, Snapshot: s.file.path.slice(`evidence/blocks/${id}/`.length), Sha256: s.file.sha256 })), Warnings: [] },
      textureResources: resources.map(resource => ({ resource, materialId: `atlas_${sha256(resource).slice(0, 8)}`, sourceSha256: sources.get(resource).sourceImage.sha256,
        uvPolicy: 'full_canvas_no_packing_no_seam_repair', alphaPolicy: 'exact_source_alpha_at_nearest_source_texel' })) };
    blocks.push({ id, sourceBlock: id, sourceFiles: files, warnings: [], credits: ['Synthetic test fixture'],
      blockMap: await put(`evidence/blocks/${id}/block-map.json`, '{}'),
      sourceReferences: await put(`evidence/blocks/${id}/model-source-references.json`, JSON.stringify(audit)) });
  }
  const groupId = '0123456789abcdef01234567', prefix = `evidence/groups/${groupId}/`;
  const recipe = { Version: 1, Id: groupId, SourceBlock: 'iron_door', Layout: 'upper_lower_continuous', Width: 4, Height: 8,
    Cells: [top, bottom].map((resource, index) => ({ Resource: resource, Unit: sources.get(resource).unit, SourceSha256: sources.get(resource).sourceImage.sha256, X: 0, Y: index * 4, Width: 4, Height: 4 })),
    SourceEvidence: blocks.find(b => b.id === 'iron_door').sourceFiles.map((s: any) => ({ Resource: s.resource, Sha256: s.file.sha256,
      Snapshot: s.file.path.slice('evidence/blocks/iron_door/'.length), Path: 'Z:/ignored/historical/source.json' })) };
  const raw = { width: 4, height: 8, rgba: Buffer.alloc(128) }, assembled = { ...raw, rgba: Buffer.alloc(128) }, source = { ...raw, rgba: Buffer.alloc(128) };
  for (const cell of recipe.Cells) {
    const original = originals.get(cell.Resource)!, selected = outputs.get(cell.Resource)!;
    selected.rgba.copy(assembled.rgba, cell.Y * 4 * 4); selected.rgba.copy(raw.rgba, cell.Y * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) original.rgba.copy(source.rgba, ((cell.Y + y) * 4 + x) * 4,
      (Math.floor(y / 2) * 2 + Math.floor(x / 2)) * 4, (Math.floor(y / 2) * 2 + Math.floor(x / 2) + 1) * 4);
  }
  for (let i = 3; i < raw.rgba.length; i += 4) raw.rgba[i] = 255;
  if (fault === 'alpha') outputs.get(control)!.rgba[3] = 255;
  if (fault === 'crop') { outputs.get(top)!.rgba[0]++; assembled.rgba[0]++; }
  for (let i = 3; i < assembled.rgba.length; i += 4) if (assembled.rgba[i] === 0) assembled.rgba.fill(0, i - 3, i);
  const sourcePin = await put(`${prefix}source.png`, pngImage(source)), rawPin = await put(`${prefix}raw_edit.png`, pngImage(raw));
  const outputPin = await put(`${prefix}upgraded.png`, pngImage(assembled));
  const group = { schema: 'tilelab-model-texture-group-v1', status: 'generated_unreviewed', recipe,
    generationSettings: { Model: 'offline-fixture', Quality: 'test', ModelTextureMode: 'groups' }, requestId: 'fixture-door',
    sourceCompositeSha256: sourcePin.sha256, generatedSha256: rawPin.sha256, outputSha256: outputPin.sha256 };
  if (fault === 'group') group.recipe.Cells[0].Y = 1;
  const groupPin = await put(`${prefix}group.json`, JSON.stringify(group));
  for (const resource of [control, top, bottom]) {
    const data = sources.get(resource), output = outputs.get(resource)!, members = resource === control ? ['lever', 'stone_button'] : ['iron_door'];
    const selected = { ...await put(`textures/${data.unit}/${fault === 'fallback' && resource === control ? 'raw_edit' : 'upgraded'}.png`, pngImage(output)), width: 4, height: 4 };
    const cell = recipe.Cells.find(c => c.Resource === resource), generatedSha256 = cell ? sha256(pngImage(cropPixels(raw, { ...cell, Y: resource === top ? 0 : 4 }))) : sha256('offline-generated-control');
    const master = { status: 'generated_unreviewed', modelTextureMaster: true, requiresSeamRepair: false, model: 'offline-fixture', quality: 'test',
      textureResource: resource, sourceSha256: data.sourceImage.sha256, outputSha256: selected.sha256, generatedSha256,
      requestId: resource === control ? 'fixture-controls' : 'fixture-door', outputSize: '4x4',
      ...(cell ? { modelTextureGroup: { id: groupId, receipt: `_model_texture_groups/${groupId}/report.json`, cell,
        rawCompositeSha256: rawPin.sha256, sourceCompositeSha256: sourcePin.sha256 }, cropPolicy: 'exact_integer_rectangle_no_resampling' } : {}) };
    const masterPin = await put(`evidence/receipts/${data.unit}/master.json`, JSON.stringify(master));
    const materialId = `atlas_${sha256(resource).slice(0, 8)}`, receipts = [masterPin];
    for (const block of members) {
      const receipt = { schema: 'tilelab-model-texture-output-v1', status: 'generated_unreviewed', textureResource: resource, sharedTextureUnit: data.unit,
        sourceSha256: data.sourceImage.sha256, outputSha256: selected.sha256, generatedSha256, sharedMasterReceiptSha256: masterPin.sha256,
        alphaPolicy: 'source_texel_alpha_exact', uvPolicy: 'full_canvas_no_packing_no_seam_repair' };
      if (fault === 'receipt' && resource === control) receipt.sharedMasterReceiptSha256 = '0'.repeat(64);
      const pin = await put(`evidence/receipts/${block}/${materialId}.json`, JSON.stringify(receipt));
      if (!(fault === 'missing-receipt' && block === 'stone_button')) receipts.push(pin);
    }
    if (cell) receipts.push(groupPin);
    materials.push({ resource, sharedUnit: data.unit, materialIds: [materialId], blocks: members, source: { image: data.sourceImage,
      alphaKind: resource === control ? 'partial_alpha' : 'binary_mask', alphaSha256: sha256(alphaPlane(originals.get(resource)!)) },
      variant: 'upgraded', selected, generationStatus: 'generated_unreviewed', review: { status: 'preview', reviewer: 'Test', note: 'Offline fixture' }, receipts });
  }
  const doc = { schema: 'tilelab-material-export-v1', revision: 'synthetic-upgraded-v1', selectionStatus: 'complete', upgradeStatus: 'complete',
    colorSpace: 'srgb', alphaPolicy: 'exact_source_alpha_at_nearest_source_texel', rightsStatus: 'synthetic test',
    uvBasis: { units: 16, origin: 'top-left', mapping: 'full-canvas', policy: 'full_canvas_no_packing_no_seam_repair', layoutIdentityAuthority: 'consumer' }, blocks, materials, files: pins };
  const selection: ModelExportSelection = { schema: 'maze-model-export-selection-v1', descriptorSha256: '', revision: doc.revision,
    blocks: ['lever', 'iron_door', 'stone_button'], variant: 'upgraded', abstractRoot: 'minecraft:block/block:geometry-only-v1', review: 'Offline upgraded conformance fixture' };
  const publish = async () => { const descriptor = JSON.stringify(doc); await writeFile(path.join(root, 'material-export.json'), descriptor); selection.descriptorSha256 = sha256(descriptor); };
  await publish();
  return { parent, root, selection, doc, publish, async originals() {
    for (const material of doc.materials) { material.variant = 'source_native'; material.selected = material.source.image; }
    doc.upgradeStatus = 'pending_or_not_selected'; selection.variant = 'source_native'; await publish();
  } };
}
