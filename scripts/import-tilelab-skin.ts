import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safePath, sha256, serialize } from './import-tilelab-pack.ts';
import { validateSkinCatalog, validateSkinDimensions } from '../src/assets3d/humanoid/contract.ts';
import type { SkinCatalog, SkinAsset } from '../src/assets3d/humanoid/contract.ts';

export interface SkinSelection {
  reportSha256: string; rawSheetSha256: string;
  skins: Array<{ id: string; label: string; filename: string; sha256: string; kind: 'generated' | 'source' }>;
}
export interface SkinGallerySelection { schemaVersion: 1; sources: Array<{ source: string; selection: SkinSelection }> }
async function readSelection(source: string, selection: SkinSelection) {
  const reportBytes = await readFile(await safePath(source, 'skin-report.json'));
  if (sha256(reportBytes) !== selection.reportSha256) throw new Error('Skin report changed; review the selection again');
  const report = JSON.parse(reportBytes.toString('utf8'));
  if (report.schema !== 'mazequest-tilelab-skin-v1' || report.rig !== 'skin_compatible_humanoid_v1' || report.status !== 'generated_unreviewed' ||
    !['classic', 'slim'].includes(report.skinModel) || report.alphaPolicy !== 'preserve_source_uv_alpha') throw new Error('Incompatible or incomplete TileLab skin report');
  const raw = await readFile(await safePath(source, 'skin_faces_raw.png'));
  if (sha256(raw) !== selection.rawSheetSha256 || report.rawSheetSha256 !== selection.rawSheetSha256) throw new Error('Raw face sheet changed');
  const files = new Map<string, Buffer>(); const skins: SkinAsset[] = [];
  for (const entry of selection.skins) {
    if (entry.filename === 'skin_faces_raw.png' || (entry.kind === 'generated' && entry.filename !== report.output) ||
      (entry.kind === 'source' && entry.filename !== 'skin_original.png')) throw new Error('Packed face sheets are not standard skin atlases. Select the producer-prepared skin_upgraded.png or skin_original.png.');
    const bytes = await readFile(await safePath(source, entry.filename)); const digest = sha256(bytes);
    if (digest !== entry.sha256 || digest !== (entry.kind === 'generated' ? report.generatedSha256 : report.sourceSha256)) throw new Error(`Skin image changed: ${entry.filename}`);
    if (bytes.length < 32 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes[25] !== 6 ||
      bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') throw new Error('Expected an intact RGBA PNG skin with preserved alpha');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20); validateSkinDimensions(width, height);
    const texturePath = `textures/${entry.id}-${digest}.png`; files.set(texturePath, bytes);
    skins.push({ id: entry.id, label: entry.label, layout: 'minecraft-64x64', model: report.skinModel,
      texture: { path: texturePath, sha256: digest, width, height },
      provenance: { run: path.basename(path.dirname(source)), sourceId: report.id, image: entry.filename, imageSha256: digest,
        reportSha256: selection.reportSha256, rawSheetSha256: selection.rawSheetSha256, kind: entry.kind, status: 'preview' } });
  }
  return { skins, files };
}
async function saveCatalog(destination: string, skins: SkinAsset[], files: Map<string, Buffer>, write: boolean, expectedRevision?: string) {
  const catalog: SkinCatalog = { schemaVersion: 1, revision: '', skins }; catalog.revision = sha256(serialize(catalog)); validateSkinCatalog(catalog);
  if (!write) return catalog;
  await mkdir(destination, { recursive: true });
  const target = await safePath(destination, 'manifest.json');
  let before: string | undefined; try { before = await readFile(target, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  if (before && before !== serialize(catalog) && JSON.parse(before).revision !== expectedRevision) throw new Error('Skin catalog changed; provide --expected-revision after review');
  const lockPath = await safePath(destination, 'import.lock'), lock = await open(lockPath, 'wx');
  try {
    let current: string | undefined; try { current = await readFile(target, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (current !== before) throw new Error('Concurrent skin catalog update; retry');
    for (const [file, bytes] of files) {
      const targetFile = await safePath(destination, file); await mkdir(path.dirname(targetFile), { recursive: true });
      let existing: Buffer | undefined; try { existing = await readFile(targetFile); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      if (existing && !existing.equals(bytes)) throw new Error('Immutable skin destination was modified');
      if (!existing) await writeFile(targetFile, bytes, { flag: 'wx' });
    }
    if (before !== serialize(catalog)) {
      const pending = await safePath(destination, 'manifest.pending.json'); await writeFile(pending, serialize(catalog), { flag: 'wx' }); await rename(pending, target);
    }
  } finally { await lock.close(); await unlink(lockPath); }
  return catalog;
}
export async function importSkins(source: string, destination: string, selection: SkinSelection, write = false, expectedRevision?: string) {
  const { skins, files } = await readSelection(source, selection); return saveCatalog(destination, skins, files, write, expectedRevision);
}
/** Explicit multi-run selection; never discovers or admits an entire authoring catalog automatically. */
export async function importSkinGallery(root: string, destination: string, selection: SkinGallerySelection, write = false, expectedRevision?: string) {
  if (selection.schemaVersion !== 1 || !Array.isArray(selection.sources) || !selection.sources.length || selection.sources.length > 32) throw new Error('Invalid skin gallery selection');
  const skins: SkinAsset[] = [], files = new Map<string, Buffer>();
  for (const entry of selection.sources) {
    const source = path.dirname(await safePath(root, `${entry.source}/skin-report.json`));
    const selected = await readSelection(source, entry.selection); skins.push(...selected.skins);
    for (const [name, bytes] of selected.files) files.set(name, bytes);
  }
  return saveCatalog(destination, skins, files, write, expectedRevision);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), get = (key: string) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
    if (!args.includes('--source')) throw new Error('Usage: assets:import-skin -- --source <TileLab skin folder> [--write]');
    const selection = JSON.parse(await readFile(get('--selection') ?? 'scripts/asset-selections/humanoid-sample.json', 'utf8'));
    const importer = Array.isArray(selection.sources) ? importSkinGallery : importSkins;
    const catalog = await importer(path.resolve(get('--source')!), path.resolve('public/assets/character-skins/local'), selection, args.includes('--write'), args.includes('--expected-revision') ? get('--expected-revision') : undefined);
    console.log(serialize(catalog));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
