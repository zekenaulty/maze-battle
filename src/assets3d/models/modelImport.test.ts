import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importModelProof } from '../../../scripts/import-model-proof';
import type { ModelSelection } from '../../../scripts/import-model-proof';
import { sha256 } from '../../../scripts/import-tilelab-pack';
import { validateModelPack } from './contract';

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
});
