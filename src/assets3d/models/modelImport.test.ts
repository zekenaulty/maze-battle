import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importModelProof } from '../../../scripts/import-model-proof';
import type { ModelSelection } from '../../../scripts/import-model-proof';
import { sha256 } from '../../../scripts/import-tilelab-pack';
import { validateModelPack } from './contract';
import { importModelExport, type ModelExportSelection } from '../../../scripts/import-model-export';
import { decodeModelPng } from '../../../scripts/model-png';
import { pngImage, upgradedExportFixture } from './modelExport.test-support';

async function fixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'maze-model-proof-')), root = path.join(parent, 'test-run');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const selection: ModelSelection = { schema: 'maze-model-selection-v1', run: 'test-run', variant: 'source_native',
    abstractRoot: 'minecraft:block/block:geometry-only-v1', review: 'Offline synthetic conformance fixture', blocks: {} };
  const put = async (relative: string, value: string | Buffer) => { const p = path.join(root, relative); await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, value); };
  const sharedResource = 'minecraft:block/shared';
  for (const block of ['lever', 'iron_door']) {
    const models = block === 'lever' ? ['_bdc/lever_wall', '_bdc/lever_wall_on'] : ['iron_door_bottom_left', 'iron_door_top_left'];
    const files: any[] = [];
    for (const name of models) {
      const snapshot = `source-models/models/block/${name}.json`, value = JSON.stringify({ parent: 'block/block', textures: { surface: sharedResource },
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { south: { texture: '#surface', uv: [16, 0, 0, 16] } } }] });
      await put(`${block}/${snapshot}`, value); files.push({ Resource: `minecraft:block/${name}`, Snapshot: snapshot, Sha256: sha256(value) });
    }
    const variants = { 'face=wall,facing=south,powered=false': { model: 'block/_bdc/lever_wall', x: 270 }, 'face=wall,facing=south,powered=true': { model: 'block/_bdc/lever_wall_on', x: 270 } };
    const snapshot = `source-models/blockstates/${block}.json`, state = JSON.stringify({ variants }); await put(`${block}/${snapshot}`, state);
    files.push({ Resource: `minecraft:${block}`, Snapshot: snapshot, Sha256: sha256(state) });
    const original = 'materials/atlas/source_native.png'; await put(`${block}/${original}`, png);
    const evidence = JSON.stringify({ schema: 'tilelab-model-source-evidence-v1', source: { SourceBlock: block, Files: files, Warnings: ['Explicit geometry-only root'] },
      textureResources: [{ resource: sharedResource, materialId: 'atlas', sourceSha256: sha256(png), original, upgraded: null,
        uvPolicy: 'full_canvas_no_packing_no_seam_repair', alphaPolicy: 'exact_source_alpha_at_nearest_source_texel' }] });
    await put(`${block}/model-source-references.json`, evidence);
    selection.blocks[block] = { evidenceSha256: sha256(evidence), images: { [sharedResource]: sha256(png) } };
  }
  return { parent, root, selection, put };
}

describe('TileLab model evidence intake', () => {
  it('imports a relocated portable export, verifies every pin and refuses changed or implicit upgraded input', async () => {
    const f = await fixture(); try {
      const pins: { path: string; sha256: string }[] = [], blocks: any[] = [], root = path.join(f.root, 'portable');
      const put = async (relative: string, bytes: Buffer) => { await f.put(`portable/${relative}`, bytes); const pin = { path: relative, sha256: sha256(bytes) }; pins.push(pin); return pin; };
      for (const id of ['lever', 'iron_door']) {
        const audit = JSON.parse(await readFile(path.join(f.root, id, 'model-source-references.json'), 'utf8'));
        const sourceFiles = [];
        for (const source of audit.source.Files) sourceFiles.push({ resource: source.Resource,
          file: await put(`evidence/blocks/${id}/${source.Snapshot}`, await readFile(path.join(f.root, id, source.Snapshot))) });
        audit.source.AbsoluteHistoricalPath = 'Z:/deliberately-unavailable/source';
        blocks.push({ id, sourceBlock: id, sourceFiles, warnings: [], credits: ['Local synthetic credit'],
          blockMap: await put(`evidence/blocks/${id}/block-map.json`, Buffer.from('{}')),
          sourceReferences: await put(`evidence/blocks/${id}/model-source-references.json`, Buffer.from(JSON.stringify(audit))) });
      }
      const image = { ...await put('textures/source_native.png', await readFile(path.join(f.root, 'lever/materials/atlas/source_native.png'))), width: 1, height: 1 };
      const doc = { schema: 'tilelab-material-export-v1', revision: 'portable-v1', selectionStatus: 'complete', upgradeStatus: 'pending_or_not_selected',
        colorSpace: 'srgb', alphaPolicy: 'exact_source_alpha_at_nearest_source_texel', rightsStatus: 'fixture',
        uvBasis: { units: 16, origin: 'top-left', mapping: 'full-canvas', policy: 'full_canvas_no_packing_no_seam_repair', layoutIdentityAuthority: 'consumer' },
        blocks, files: pins, materials: [{ resource: 'minecraft:block/shared', blocks: ['lever', 'iron_door'], materialIds: ['atlas'], variant: 'source_native',
          source: { image, alphaKind: 'binary_mask' }, selected: image }] };
      const descriptor = JSON.stringify(doc); await f.put('portable/material-export.json', descriptor);
      const choice: ModelExportSelection = { schema: 'maze-model-export-selection-v1', descriptorSha256: sha256(descriptor), revision: doc.revision,
        blocks: ['lever', 'iron_door'], variant: 'source_native', abstractRoot: 'minecraft:block/block:geometry-only-v1', review: 'Offline proof' };
      const a = await importModelExport(root, choice), relocated = path.join(f.parent, 'relocated'); await cp(root, relocated, { recursive: true });
      const b = await importModelExport(relocated, choice); expect(b.pack).toEqual(a.pack); expect(b.verifiedFiles).toBe(pins.length);
      expect(b.files.size).toBe(1); expect(b.pack.provenance.warnings).toContain('lever credit: Local synthetic credit');
      await expect(importModelExport(root, { ...choice, descriptorSha256: '0'.repeat(64) })).rejects.toThrow('descriptor changed');
      await expect(importModelExport(root, { ...choice, variant: 'upgraded' })).rejects.toThrow('Selected material/alpha policy differs');
      await f.put('portable/textures/source_native.png', Buffer.from('changed')); await expect(importModelExport(root, choice)).rejects.toThrow('Export file changed');
      doc.files[0].path = '../outside.json'; const unsafe = JSON.stringify(doc); await f.put('portable/material-export.json', unsafe);
      await expect(importModelExport(root, { ...choice, descriptorSha256: sha256(unsafe) })).rejects.toThrow('Unsafe relative path');
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  });
  it('deduplicates shared texture bytes, pins a source basis and reproduces all model revisions', async () => {
    const f = await fixture(); try {
      const a = await importModelProof(f.root, f.selection), b = await importModelProof(f.root, f.selection);
      expect(a.pack).toEqual(b.pack); expect(a.files.size).toBe(1);
      expect(a.pack.assets['iron-door-source'].payload.geometries.door).toHaveLength(4);
      const material = Object.values(a.pack.materials).find(m => m.texture)!;
      expect(material.layoutId).toContain(f.selection.blocks.lever.images['minecraft:block/shared']);
      const corrupt = structuredClone(a.pack); material.texture!.path = 'https://invalid.example/texture.png';
      expect(() => validateModelPack(a.pack)).toThrow('Invalid visual texture');
      corrupt.bindings['lever-wall-source'].atlas = 'native_stone'; expect(() => validateModelPack(corrupt)).toThrow('Incompatible');
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  });
  it('rejects changed source geometry, changed originals and incomplete upgraded output without fallback', async () => {
    const f = await fixture(); try {
      await expect(importModelProof(f.root, { ...f.selection, variant: 'upgraded' })).rejects.toThrow('not complete');
      const file = path.join(f.root, 'lever/source-models/models/block/_bdc/lever_wall.json'); await writeFile(file, `${await readFile(file, 'utf8')}\n`);
      await expect(importModelProof(f.root, f.selection)).rejects.toThrow('Source JSON changed');
    } finally { await rm(f.parent, { recursive: true, force: true }); }
    const other = await fixture(); try {
      await other.put('lever/materials/atlas/source_native.png', Buffer.from('changed bytes'));
      await expect(importModelProof(other.root, other.selection)).rejects.toThrow('Selected image changed');
    } finally { await rm(other.parent, { recursive: true, force: true }); }
  });

  it('imports portable upgraded lever/button/door candidates with exact alpha/crops and unchanged original geometry/layout identities', async () => {
    const f = await upgradedExportFixture(); try {
      const upgraded = await importModelExport(f.root, f.selection), relocated = path.join(f.parent, 'moved-package');
      await cp(f.root, relocated, { recursive: true });
      expect((await importModelExport(relocated, f.selection)).pack).toEqual(upgraded.pack);
      expect(upgraded.verifiedFiles).toBe(f.doc.files.length);
      expect(Object.keys(upgraded.pack.assets)).toEqual(['lever-wall-source', 'iron-door-source', 'lever-wall-native', 'stone-button-wall-source']);
      expect(upgraded.pack.bindings['lever-wall-source']).toEqual(upgraded.pack.bindings['stone-button-wall-source']);
      const button = upgraded.pack.assets['stone-button-wall-source'];
      expect(button.states).toEqual({ off: { geometry: 'off' }, on: { geometry: 'on' } });
      expect(button.payload.geometries.off[1].size).toEqual([6 / 16, 2 / 16, 4 / 16]);
      expect(button.payload.geometries.on[1].size).toEqual([6 / 16, 1 / 16, 4 / 16]);
      expect(button.payload.geometries.off[0].rotation).toEqual([-Math.PI / 2, -Math.PI, 0]);
      const evidence = JSON.parse(upgraded.files.get('evidence/intake.json')!.toString());
      expect(evidence.materials).toHaveLength(3);
      for (const material of evidence.materials) expect(material).toMatchObject({ exactSourceAlpha: true, verifiedPixels: 16 });
      for (const material of evidence.materials.filter((m: any) => m.group)) {
        expect(material.group).toMatchObject({ exactRawRgbCrop: true, exactVisibleRgbaCrop: true });
        expect(material.group.transparentRgbDifferences).toBeGreaterThan(0);
      }
      const controls = Object.values(upgraded.pack.materials).find(m => m.label === 'minecraft:block/_bdc/switches')!;
      expect(controls.render.alphaMode).toBe('blend');
      await f.originals(); const original = await importModelExport(f.root, f.selection);
      expect(original.pack.assets).toEqual(upgraded.pack.assets);
      expect(Object.values(original.pack.materials).map(m => m.layoutId)).toEqual(Object.values(upgraded.pack.materials).map(m => m.layoutId));
      expect(Object.values(original.pack.materials).filter(m => m.texture).every(m => m.texture!.width === 2)).toBe(true);
      expect(Object.values(upgraded.pack.materials).filter(m => m.texture).every(m => m.texture!.width === 4)).toBe(true);
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  });

  it.each([
    ['alpha', 'source alpha differs'], ['crop', 'raw RGB crop differs'], ['receipt', 'Output receipt differs'],
    ['group', 'crop/resource association differs'], ['fallback', 'no raw/source fallback'], ['missing-receipt', 'Missing block output receipt'],
  ] as const)('rejects a fully re-pinned upgraded export with invalid %s evidence', async (fault, diagnostic) => {
    const f = await upgradedExportFixture(fault); try {
      await expect(importModelExport(f.root, f.selection)).rejects.toThrow(diagnostic);
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  });

  it('decodes exact partial alpha and rejects corrupt or oversized PNG headers before use', () => {
    const pixels = { width: 2, height: 1, rgba: Buffer.from([19, 30, 41, 0, 200, 150, 100, 128]) }, bytes = pngImage(pixels);
    expect(decodeModelPng(bytes)).toEqual(pixels);
    const corrupt = Buffer.from(bytes); corrupt[corrupt.length - 1] ^= 1;
    expect(() => decodeModelPng(corrupt)).toThrow('CRC');
    expect(() => decodeModelPng(bytes.subarray(0, bytes.length - 12))).toThrow('missing IEND');
    expect(() => decodeModelPng(pngImage({ width: 4097, height: 1, rgba: Buffer.alloc(4097 * 4) }))).toThrow('canvas required');
  });
});
