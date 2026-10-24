// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { crc32, deflateSync } from 'node:zlib';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { importSkinGallery, importSkins } from '../../../scripts/import-tilelab-skin';
import { sha256, serialize } from '../../../scripts/import-tilelab-pack';
import type { SkinGallerySelection, SkinSelection } from '../../../scripts/import-tilelab-skin';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
function png(width: number, height: number) {
  const chunk = (type: string, bytes: Buffer) => {
    const tag = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([tag, bytes])));
    return Buffer.concat([length, tag, bytes, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}
async function fixture(width = 512, height = width) {
  const root = await mkdtemp(path.join(tmpdir(), 'maze-skin-')); roots.push(root);
  const source = path.join(root, 'run-test', 'test-skin'), destination = path.join(root, 'runtime'); await mkdir(source, { recursive: true });
  const original = png(64, 64), generated = png(width, height), raw = png(1024, 1024);
  const report = { schema: 'mazequest-tilelab-skin-v1', id: 'test-skin', rig: 'skin_compatible_humanoid_v1', status: 'generated_unreviewed', skinModel: 'classic', alphaPolicy: 'preserve_source_uv_alpha', output: 'skin_upgraded.png',
    sourceSha256: sha256(original), generatedSha256: sha256(generated), rawSheetSha256: sha256(raw) };
  const reportBytes = serialize(report);
  await Promise.all([writeFile(path.join(source, 'skin-report.json'), reportBytes), writeFile(path.join(source, 'skin_original.png'), original),
    writeFile(path.join(source, 'skin_upgraded.png'), generated), writeFile(path.join(source, 'skin_faces_raw.png'), raw)]);
  const selection: SkinSelection = { reportSha256: sha256(reportBytes), rawSheetSha256: sha256(raw), skins: [
    { id: 'hd', label: 'HD fixture', filename: 'skin_upgraded.png', kind: 'generated', sha256: sha256(generated) },
    { id: 'original', label: 'Source fixture', filename: 'skin_original.png', kind: 'source', sha256: sha256(original) },
  ] };
  return { source, destination, selection, generated, report };
}
it('copies the selected 512/64 atlases byte-for-byte and reimports deterministically', async () => {
  const f = await fixture(); const first = await importSkins(f.source, f.destination, f.selection, true);
  expect(first.skins.map(s => s.texture.width)).toEqual([512, 64]);
  expect(await readFile(path.join(f.destination, first.skins[0].texture.path))).toEqual(f.generated);
  expect(await importSkins(f.source, f.destination, f.selection, true)).toEqual(first);
  f.selection.skins[0].label = 'Reviewed label';
  await expect(importSkins(f.source, f.destination, f.selection, true)).rejects.toThrow('expected-revision');
  expect((await importSkins(f.source, f.destination, f.selection, true, first.revision)).skins[0].label).toBe('Reviewed label');
});
it('rejects the packed raw face sheet and incompatible atlas dimensions with diagnostics', async () => {
  const f = await fixture(); f.selection.skins[0].filename = 'skin_faces_raw.png';
  await expect(importSkins(f.source, f.destination, f.selection)).rejects.toThrow('Packed face sheets');
  const wrong = await fixture(512, 256);
  await expect(importSkins(wrong.source, wrong.destination, wrong.selection)).rejects.toThrow('Incompatible skin 512×256');
});
it('rejects changed artwork, raw provenance and incomplete source reports', async () => {
  const f = await fixture(); f.selection.skins[0].sha256 = '0'.repeat(64);
  await expect(importSkins(f.source, f.destination, f.selection)).rejects.toThrow('Skin image changed');
  f.selection.rawSheetSha256 = '0'.repeat(64);
  await expect(importSkins(f.source, f.destination, f.selection)).rejects.toThrow('Raw face sheet changed');
  f.report.status = 'running'; const report = serialize(f.report); await writeFile(path.join(f.source, 'skin-report.json'), report); f.selection.reportSha256 = sha256(report);
  await expect(importSkins(f.source, f.destination, f.selection)).rejects.toThrow('incomplete');
});
it('combines explicit runs atomically, preserves existing selections, and rejects duplicate or escaping sources', async () => {
  const f = await fixture(), root = path.dirname(f.source), second = structuredClone(f.selection);
  await cp(f.source, path.join(root, 'second-skin'), { recursive: true });
  second.skins = [{ ...second.skins[0], id: 'second-hd', label: 'Second appearance' }];
  const selection: SkinGallerySelection = { schemaVersion: 1, sources: [
    { source: 'test-skin', selection: f.selection }, { source: 'second-skin', selection: second },
  ] };
  const first = await importSkinGallery(root, f.destination, selection, true);
  expect(first.skins.map(s => s.id)).toEqual(['hd', 'original', 'second-hd']);
  expect(await importSkinGallery(root, f.destination, selection, true)).toEqual(first);
  const saved = await readFile(path.join(f.destination, 'manifest.json'), 'utf8');
  second.skins[0].id = 'hd';
  await expect(importSkinGallery(root, f.destination, selection, true, first.revision)).rejects.toThrow('Invalid skin asset/layout');
  selection.sources[1].source = '../outside';
  await expect(importSkinGallery(root, f.destination, selection, true, first.revision)).rejects.toThrow();
  selection.sources[1].source = 'missing-skin';
  await expect(importSkinGallery(root, f.destination, selection, true, first.revision)).rejects.toThrow();
  expect(await readFile(path.join(f.destination, 'manifest.json'), 'utf8')).toBe(saved);
});
