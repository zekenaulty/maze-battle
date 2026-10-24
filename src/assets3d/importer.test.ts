// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { importPack, safePath, serialize, sha256 } from '../../scripts/import-tilelab-pack';
import type { Selection } from '../../scripts/import-tilelab-pack';
import { AssetRegistry } from './registry';
import { FACE_ORDER, validateAssetPack } from './manifest';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5n0AAAAASUVORK5CYII=', 'base64');
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'maze-pack-')); roots.push(root);
  const source = path.join(root, 'run-test'); const destination = path.join(root, 'packs', 'test-pack');
  await mkdir(source); await mkdir(path.dirname(destination));
  const selection: Selection = { schemaVersion: 1, pack: { id: 'test-pack', version: '1' }, blocks: [] };
  async function add(id: string, members: string[], six = false, status = 'generated_unreviewed') {
    const dir = path.join(source, id); await mkdir(dir, { recursive: true });
    const faces = six ? [...FACE_ORDER.map((face, i) => ({ face, materialId: members[i % members.length], isAlt: false }))]
      : [{ face: 'surface', materialId: members[0], isAlt: false }];
    const map = { block: id, status, pipeline: six ? 'atlas_cube' : 'simple', faces,
      materialFiles: members.map(m => ({ id: m, label: m, tileable: true, output: `materials/${m}/repaired_seam.png` })) };
    for (const m of members) {
      const material = path.join(dir, 'materials', m); await mkdir(material, { recursive: true });
      await writeFile(path.join(material, 'raw_edit.png'), png);
      await writeFile(path.join(material, 'repaired_seam.png'), Buffer.concat([png, Buffer.from('different')]));
      await writeFile(path.join(material, 'report.json'), serialize({ status: 'generated_unreviewed', generatedSha256: sha256(png) }));
    }
    await writeFile(path.join(dir, 'block-map.json'), serialize(map));
    selection.blocks.push({ source: id, review: { status: 'preview', reviewer: 'test', note: 'Synthetic fixture' } });
    return map;
  }
  async function addAnimation() {
    const map: any = await add('soul_sand', ['animated', 'cap'], true);
    map.faces = FACE_ORDER.map(face => ({ face, materialId: face === 'top' ? 'cap' : 'animated', isAlt: false }));
    map.generationMode = 'frames';
    const frames = [];
    for (const sourceIndex of [3, 9]) {
      const folder = `materials/animated/frames/${String(sourceIndex).padStart(4, '0')}`;
      await mkdir(path.join(source, 'soul_sand', folder), { recursive: true });
      await writeFile(path.join(source, 'soul_sand', folder, 'raw_edit.png'), png);
      await writeFile(path.join(source, 'soul_sand', folder, 'report.json'), serialize({ status: 'generated_unreviewed', generatedSha256: sha256(png) }));
      frames.push({ sourceIndex, output: `${folder}/repaired_seam.png`, status: 'generated_unreviewed' });
    }
    map.materialFiles[0].animation = { mode: 'frames', loop: true, interpolate: false, frames,
      timeline: [{ frame: 1, sourceIndex: 9, durationMs: 25 }, { frame: 0, sourceIndex: 3, durationMs: 75 }, { frame: 1, sourceIndex: 9, durationMs: 125 }] };
    selection.blocks[0].images = { animated: { variant: 'raw_edit', frames: { 3: sha256(png), 9: sha256(png) } } };
    await writeFile(path.join(source, 'soul_sand', 'block-map.json'), serialize(map));
    return map;
  }
  return { source, destination, selection, add, addAnimation };
}
describe('curated TileLab import and runtime registry', () => {
  it('imports pinned animation frames, preserves the timeline and keeps static companion faces', async () => {
    const f = await fixture(); await f.addAnimation();
    const { manifest } = await importPack({ ...f, write: true });
    const material = manifest.materials['soul_sand:animated'];
    expect(material.animation!.frames.map(f => f.sourceIndex)).toEqual([3, 9]);
    expect(material.animation!.timeline).toEqual([{ frame: 1, durationMs: 25 }, { frame: 0, durationMs: 75 }, { frame: 1, durationMs: 125 }]);
    expect(material.texture.path).toContain('frame0009');
    expect(material.animation!.frames[0].provenance.image).toContain('/frames/0003/raw_edit.png');
    expect(manifest.materials['soul_sand:cap'].animation).toBeUndefined();
    expect(new AssetRegistry(manifest).resolve('soul_sand').faces[2].material!.id).toBe('soul_sand:cap');
    expect((await importPack({ ...f, write: true })).changed).toEqual([]);
    f.selection.blocks[0].images!.animated.frames!['3'] = '0'.repeat(64);
    await expect(importPack(f)).rejects.toThrow('Reviewed frame changed');
    const invalid = structuredClone(manifest); invalid.materials['soul_sand:animated'].animation!.timeline[0].frame = 99;
    expect(() => validateAssetPack(invalid)).toThrow('animation timeline');
    const mismatched = structuredClone(manifest); mismatched.materials['soul_sand:animated'].animation!.frames[0].texture.width = 2;
    expect(() => validateAssetPack(mismatched)).toThrow('animation dimensions');
  });
  it('leaves an incomplete animation pending and rejects unsupported interpolation and changed timelines', async () => {
    const f = await fixture(); const map = await f.addAnimation();
    const first = await importPack({ ...f, write: true });
    map.materialFiles[0].animation.frames[1].status = 'pending';
    await writeFile(path.join(f.source, 'soul_sand', 'block-map.json'), serialize(map));
    const pending = await importPack({ ...f, write: true });
    expect(pending.manifest.revision).toBe(first.manifest.revision); expect(pending.pending[0]).toContain('still in progress');
    map.materialFiles[0].animation.frames[1].status = 'generated_unreviewed'; map.materialFiles[0].animation.interpolate = true;
    await writeFile(path.join(f.source, 'soul_sand', 'block-map.json'), serialize(map));
    await expect(importPack(f)).rejects.toThrow('Unsupported animation');
    map.materialFiles[0].animation.interpolate = false; map.materialFiles[0].animation.timeline[0].durationMs = 100;
    await writeFile(path.join(f.source, 'soul_sand', 'block-map.json'), serialize(map));
    await expect(importPack(f)).rejects.toThrow('Block soul_sand changed');
    const replacement = await importPack({ ...f, replaceBlocks: ['soul_sand'], expectedRevision: first.manifest.revision });
    expect(replacement.manifest.materials['soul_sand:animated'].animation!.timeline[0].durationMs).toBe(100);
  });
  it('imports fixed-master lighting receipts and rejects mismatched frames, hashes or masters', async () => {
    const f = await fixture(), map = await f.addAnimation(), material = path.join(f.source, 'soul_sand', 'materials', 'animated');
    map.materialFiles[0].animation.generationStrategy = 'fixed_master_source_lighting';
    await writeFile(path.join(f.source, 'soul_sand', 'block-map.json'), serialize(map));
    await mkdir(path.join(material, 'master'));
    await writeFile(path.join(material, 'master', 'repaired_seam.png'), png);
    await writeFile(path.join(material, 'master', 'report.json'), serialize({ status: 'generated_unreviewed' }));
    const lighting = { version: 1, status: 'generated_unreviewed', geometryLocked: true, localFrames: 2,
      master: 'master/repaired_seam.png', masterSha256: sha256(png), sourceSha256: 'a'.repeat(64), width: 1, height: 1 };
    await writeFile(path.join(material, 'lighting-animation.json'), serialize(lighting));
    const report = (sourceFrameIndex: number) => ({ status: 'generated_unreviewed', lightingVersion: 1, sourceFrameIndex,
      masterSha256: lighting.masterSha256, sourceSha256: lighting.sourceSha256, width: 1, height: 1, outputSha256: sha256(png) });
    for (const i of [3, 9]) await writeFile(path.join(material, 'frames', String(i).padStart(4, '0'), 'report.json'), serialize(report(i)));
    const { manifest } = await importPack(f), animation = manifest.materials['soul_sand:animated'].animation!;
    expect(animation.frames[0].provenance.reports.map(r => r.path)).toContain('soul_sand/materials/animated/master/report.json');
    const first = path.join(material, 'frames', '0003', 'report.json');
    await writeFile(first, serialize({ ...report(3), sourceFrameIndex: 9 }));
    await expect(importPack(f)).rejects.toThrow('Incompatible lighting frame');
    await writeFile(first, serialize({ ...report(3), outputSha256: '0'.repeat(64) }));
    await expect(importPack(f)).rejects.toThrow('Incomplete/changed frame report');
    await writeFile(first, serialize(report(3)));
    await writeFile(path.join(material, 'master', 'repaired_seam.png'), Buffer.concat([png, Buffer.from('changed')]));
    await expect(importPack(f)).rejects.toThrow('Lighting master changed');
    const m = manifest.materials['soul_sand:animated'];
    m.texture.width = m.texture.height = 2048;
    animation.frames = Array.from({ length: 32 }, (_, i) => ({ ...structuredClone(animation.frames[0]), sourceIndex: i }));
    animation.frames.forEach(frame => { frame.texture.width = frame.texture.height = 2048; });
    expect(() => validateAssetPack(manifest)).not.toThrow();
    animation.frames.push({ ...structuredClone(animation.frames[0]), sourceIndex: 32 });
    expect(() => validateAssetPack(manifest)).toThrow('animation decode budget');
  });
  it('chooses raw despite the producer repair default and imports byte-identically twice', async () => {
    const f = await fixture(); await f.add('stone', ['stone']);
    const first = await importPack({ ...f, write: true });
    const bytes = await readFile(path.join(f.destination, 'manifest.json'), 'utf8');
    const second = await importPack({ ...f, write: true });
    expect(second.changed).toEqual([]); expect(second.manifest).toEqual(first.manifest);
    expect(await readFile(path.join(f.destination, 'manifest.json'), 'utf8')).toBe(bytes);
    const material = first.manifest.materials['stone:stone'];
    expect(material.provenance.selectedVariant).toBe('raw_edit');
    expect(await readFile(path.join(f.destination, material.texture.path))).toEqual(png);
    expect(new AssetRegistry(first.manifest).resolve('stone').faces.map(f => f.material?.id)).toEqual(Array(6).fill('stone:stone'));
  });
  it('preserves six-face order, shared assignments, state mapping and alternate bindings', async () => {
    const f = await fixture();
    const map = await f.add('furnace', ['side', 'top', 'front', 'on'], true);
    map.faces = FACE_ORDER.map(face => ({ face, materialId: face === 'front' ? 'front' : face === 'top' ? 'top' : 'side', isAlt: false }));
    map.faces.push({ face: 'front_on' as any, materialId: 'on', isAlt: false });
    await writeFile(path.join(f.source, 'furnace', 'block-map.json'), serialize(map));
    await f.add('furnace_alt', ['alt']);
    f.selection.blocks[1].variantOf = { block: 'furnace', name: 'alternate' };
    const { manifest } = await importPack(f); const registry = new AssetRegistry(manifest);
    expect(registry.resolve('furnace').faces.map(f => f.face)).toEqual(FACE_ORDER);
    const unlit = registry.resolve('furnace', { state: 'unlit' });
    const lit = registry.resolve('furnace', { state: 'lit' });
    expect(lit.faces[4].material!.id).toBe('furnace:on');
    expect(lit.faces[2].material!.id).toBe('furnace:top');
    expect(lit.faces[0].material).toEqual(unlit.faces[0].material);
    expect(lit.emission!.light!.intensity).toBeGreaterThan(0);
    expect(registry.resolve('furnace', { variant: 'alternate' }).faces[0].material!.id).toBe('furnace_alt:alt');
    const repeat = await importPack({ ...f, write: true });
    expect((await importPack({ ...f, write: true })).manifest.revision).toBe(repeat.manifest.revision);
  });
  it('skips incomplete targets, preserves prior blocks during a targeted refresh and guards replacements', async () => {
    const f = await fixture(); await f.add('stone', ['stone']); await f.add('pending', ['stone'], false, 'running');
    const first = await importPack({ ...f, write: true }); expect(first.pending).toEqual(['pending: running']);
    await f.add('new', ['new']);
    const second = await importPack({ ...f, only: ['new'], write: true });
    expect(Object.keys(second.manifest.blocks)).toEqual(['new', 'stone']);
    f.selection.blocks[0].review.note = 'Reviewed new selection';
    await expect(importPack({ ...f, write: true })).rejects.toThrow('Block stone changed');
    await expect(importPack({ ...f, replaceBlocks: ['stone'], expectedRevision: first.manifest.revision })).rejects.toThrow('revision changed');
    const updated = await importPack({ ...f, replaceBlocks: ['stone'], expectedRevision: second.manifest.revision, write: true });
    expect(updated.changed).toEqual(['stone']);
  });
  it('rejects escaping paths, junctions, changed reviewed bytes and corrupted destination files', async () => {
    const f = await fixture(); await f.add('stone', ['stone']);
    for (const p of ['../secret', '/absolute', 'C:/secret', 'a\\b', 'https://x', 'a/%2e%2e/x'])
      await expect(safePath(f.source, p)).rejects.toThrow();
    const outside = path.dirname(f.source);
    await symlink(outside, path.join(f.source, 'escape'), 'junction');
    await expect(safePath(f.source, 'escape/secret.png')).rejects.toThrow('outside root');
    f.selection.blocks[0].images = { stone: { variant: 'raw_edit', sha256: '0'.repeat(64) } };
    await expect(importPack(f)).rejects.toThrow('Reviewed image changed');
    delete f.selection.blocks[0].images;
    const { manifest } = await importPack({ ...f, write: true });
    await writeFile(path.join(f.destination, manifest.materials['stone:stone'].texture.path), 'corrupted');
    await expect(importPack({ ...f, write: true })).rejects.toThrow('Destination image was modified');
  });
  it('validates schema, UV rectangles and fallbacks without creating a second game model', async () => {
    const f = await fixture(); await f.add('stone', ['stone']);
    const { manifest } = await importPack(f);
    const invalid = structuredClone(manifest); invalid.faceOrder = [...FACE_ORDER].reverse() as any;
    expect(() => validateAssetPack(invalid)).toThrow('six-face');
    invalid.faceOrder = FACE_ORDER; invalid.materials['stone:stone'].texture.path = '../escape.png';
    expect(() => validateAssetPack(invalid)).toThrow('texture');
    const uv = structuredClone(manifest);
    uv.models.chest = { kind: 'uv-boxes', atlasSize: [1, 1], parts: [{ name: 'body', size: [1, 0.75, 1], position: [0, 0, 0],
      faces: Object.fromEntries(FACE_ORDER.map(f => [f, { rect: [0, 0, 1, 1] }])) as any }] };
    validateAssetPack(uv);
    uv.models.chest.parts[0].faces.front.rect = [0, 0, 1.1, 1];
    expect(() => validateAssetPack(uv)).toThrow('UV rect');
    const fallback = new AssetRegistry().resolve('unavailable');
    expect(fallback.faces).toHaveLength(6); expect(fallback.faces[0].fallbackColor).toMatch(/^#/);
    expect(fallback.warnings).toEqual(['Missing block: unavailable']);
    expect(new AssetRegistry(manifest).resolve('stone', { variant: 'missing' }).faces[0].material!.id).toBe('stone:stone');
    for (const id of ['constructor', 'toString', '__proto__']) expect(new AssetRegistry(manifest).resolve(id).warnings).toEqual([`Missing block: ${id}`]);
    expect(new AssetRegistry(manifest).resolve('stone', { state: 'constructor' }).warnings).toEqual(['Missing state: constructor']);
    uv.models.chest.parts[0].faces.front.rect = [0, 0, 1, 1];
    uv.blocks.stone.model = 'chest';
    uv.materials['stone:stone'].surface = 'uv-atlas';
    uv.materials['wrong:atlas'] = { ...structuredClone(uv.materials['stone:stone']), id: 'wrong:atlas', surface: 'tileable' };
    uv.blocks.stone.states.lit = { faces: { front: 'wrong:atlas' } };
    expect(() => validateAssetPack(uv)).toThrow('atlas/model compatibility');
  });
  it('guards alternate renames/removal and resolves an alternate listed before its base', async () => {
    const f = await fixture(); await f.add('alt', ['alt']); await f.add('base', ['base']);
    f.selection.blocks[0].variantOf = { block: 'base', name: 'alternate' };
    const first = await importPack({ ...f, write: true });
    expect(first.manifest.blocks.base.variants.alternate.faces!.front).toBe('alt:alt');
    expect((await importPack({ ...f, write: true })).changed).toEqual([]);
    await f.add('conflict', ['new']); f.selection.blocks[2].variantOf = { block: 'base', name: 'alternate' };
    await expect(importPack({ ...f, only: ['conflict'], replaceBlocks: ['conflict'], expectedRevision: first.manifest.revision })).rejects.toThrow(/alternate (ownership|binding)/);
    f.selection.blocks.pop();
    f.selection.blocks[0].variantOf.name = 'replacement';
    await expect(importPack({ ...f, only: ['alt'], write: true })).rejects.toThrow('Block alt changed');
    const second = await importPack({ ...f, only: ['alt'], replaceBlocks: ['alt'], expectedRevision: first.manifest.revision, write: true });
    expect(Object.keys(second.manifest.blocks.base.variants)).toEqual(['replacement']);
    delete f.selection.blocks[0].variantOf;
    const third = await importPack({ ...f, only: ['alt'], replaceBlocks: ['alt'], expectedRevision: second.manifest.revision, write: true });
    expect(third.manifest.blocks.base.variants).toEqual({});
  });
  it('imports entity_uv_atlas only with pinned artwork and compatible body/lid UV geometry', async () => {
    const f = await fixture(); const map: any = await f.add('chest', ['atlas']);
    map.pipeline = 'entity_atlas'; map.faces = [{ face: 'entity_uv_atlas', materialId: 'atlas' }];
    await writeFile(path.join(f.source, 'chest', 'block-map.json'), serialize(map));
    await writeFile(path.join(f.source, 'chest', 'entity_atlas_native.png'), png);
    await writeFile(path.join(f.source, 'chest', 'entity-report.json'), serialize({ status: 'generated_unreviewed', nativeAtlasSha256: sha256(png) }));
    await expect(importPack(f)).rejects.toThrow('Reviewed UV model required');
    f.selection.blocks[0].model = { kind: 'uv-boxes', atlasSize: [1, 1], parts: ['body', 'lid'].map((name, i) => ({
      name, size: [1, i ? 0.25 : 0.75, 1], position: [0, i ? 0.5 : 0, 0],
      faces: Object.fromEntries(FACE_ORDER.map(f => [f, { rect: [0, 0, 1, 1] }])) as any,
    })) };
    f.selection.blocks[0].images = { atlas: { variant: 'entity_atlas_native', sha256: sha256(png) } };
    const { manifest } = await importPack(f);
    expect(new AssetRegistry(manifest).resolve('chest').model.kind).toBe('uv-boxes');
    const model = f.selection.blocks[0].model;
    if (model.kind !== 'uv-boxes') throw new Error('Expected multipart model');
    model.parts[1].pivot = [0, 0.375, -0.5];
    f.selection.blocks[0].states = { open: { poses: { lid: { rotation: [-1.5, 0, 0] } } } };
    await writeFile(path.join(f.source, 'chest', 'entity_atlas_raw.png'), png);
    await writeFile(path.join(f.source, 'chest', 'entity-report.json'), serialize({ status: 'generated_unreviewed', generatedSha256: sha256(png) }));
    f.selection.blocks[0].images.atlas.variant = 'entity_atlas_raw';
    const raw = await importPack({ ...f, write: true });
    const registry = new AssetRegistry(raw.manifest);
    expect(registry.resolve('chest', { state: 'open' }).poses.lid.rotation).toEqual([-1.5, 0, 0]);
    expect(raw.manifest.materials['chest:atlas'].provenance.selectedVariant).toBe('entity_atlas_raw');
    expect((await importPack({ ...f, write: true })).changed).toEqual([]);
    const invalid = structuredClone(raw.manifest);
    if (invalid.models['chest:model'].kind !== 'uv-boxes') throw new Error('Expected multipart model');
    invalid.models['chest:model'].parts[0].parent = 'lid';
    invalid.models['chest:model'].parts[1].parent = 'body';
    expect(() => validateAssetPack(invalid)).toThrow('UV parent hierarchy');
    const unknownPose = structuredClone(raw.manifest);
    unknownPose.blocks.chest.states.open.poses = { nonexistent: { rotation: [0, 0, 0] } };
    expect(() => validateAssetPack(unknownPose)).toThrow('unknown/invalid part pose');
    await writeFile(path.join(f.source, 'chest', 'entity-report.json'), serialize({ status: 'generated_unreviewed', generatedSha256: '0'.repeat(64) }));
    await expect(importPack(f)).rejects.toThrow('Entity report hash mismatch');
  });
});
