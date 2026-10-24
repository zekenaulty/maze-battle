import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FACE_ORDER, isAssetId, isSafeAssetPath, validateAssetPack } from '../src/assets3d/manifest.ts';
import type { Appearance, AssetPack, BlockDefinition, BlockFace, FaceMaterials, MaterialDefinition, ModelDefinition, Review } from '../src/assets3d/manifest.ts';

export interface Selection {
  schemaVersion: 1; pack: { id: string; version: string };
  blocks: Array<{ source: string; id?: string; label?: string; enabled?: boolean; review: Review;
    images?: Record<string, { variant: 'raw_edit' | 'repaired_seam' | 'entity_atlas_native' | 'entity_atlas_raw'; sha256?: string; frames?: Record<string, string> }>;
    variantOf?: { block: string; name: string }; model?: ModelDefinition; states?: Record<string, Appearance> }>;
}
export const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const serialize = (value: unknown) => JSON.stringify(canonical(value), null, 2) + '\n';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function inside(root: string, target: string) {
  const rel = path.relative(root, target);
  assert(rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel), `Path outside root: ${target}`);
}
/** Check both lexical paths and real filesystem targets (including Windows junctions). */
export async function safePath(root: string, relative: string) {
  assert(isSafeAssetPath(relative), `Unsafe relative path: ${relative}`);
  const base = await realpath(root);
  const target = path.resolve(base, ...relative.split('/'));
  inside(base, target);
  let existing = target;
  for (;;) {
    try { await lstat(existing); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; existing = path.dirname(existing); }
  }
  const resolved = await realpath(existing);
  if (resolved !== base) inside(base, resolved);
  return target;
}
async function optionalRead(file: string) {
  try { return await readFile(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
async function readJson(root: string, relative: string) {
  const bytes = await readFile(await safePath(root, relative));
  return { bytes, value: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) };
}
function pngSize(bytes: Buffer): [number, number] {
  assert(bytes.length > 32 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
    bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND', 'Incomplete or invalid PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
function reportSummary(relative: string, bytes: Buffer, report: any) {
  const result: any = { path: relative, sha256: sha256(bytes) };
  for (const key of ['model', 'requestId', 'timeUTC', 'sourceSha256', 'sourceFile', 'rightsStatus'])
    if (typeof report[key] === 'string') result[key] = report[key];
  return result;
}
export interface ImportOptions {
  source: string; destination: string; selection: Selection; write?: boolean;
  only?: string[]; replaceBlocks?: string[]; expectedRevision?: string;
}
/** Additive, deterministic import. Running targets are pending; a changed target needs an explicit replacement. */
export async function importPack(options: ImportOptions) {
  const { source, destination, selection } = options;
  assert(selection?.schemaVersion === 1 && isAssetId(selection.pack?.id) && typeof selection.pack.version === 'string' &&
    Array.isArray(selection.blocks), 'Invalid selection');
  // The destination is a PACK directory; its parent must already exist, never the source tree.
  const sourceRoot = await realpath(source);
  const parent = await realpath(path.dirname(destination));
  const dest = path.join(parent, path.basename(destination));
  assert(path.basename(dest) === selection.pack.id, 'Destination folder must match pack ID');
  const relative = path.relative(sourceRoot, dest);
  assert(relative.startsWith('..') || path.isAbsolute(relative), 'Destination must not be inside the TileLab run');
  await safePath(parent, path.basename(dest));
  try { assert(!(await lstat(dest)).isSymbolicLink(), 'Pack directory cannot be a link'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (options.write) await mkdir(dest, { recursive: true });
  let exists: Buffer | undefined;
  try { exists = await optionalRead(await safePath(dest, 'manifest.json')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const previous: AssetPack | undefined = exists ? JSON.parse(exists.toString('utf8')) : undefined;
  if (previous) { validateAssetPack(previous); assert(previous.id === selection.pack.id && previous.version === selection.pack.version, 'Pack identity/version mismatch'); }
  if (options.expectedRevision) assert(previous?.revision === options.expectedRevision, 'Pack revision changed; review again');
  const pack: AssetPack = previous ? structuredClone(previous) : {
    schemaVersion: 1, id: selection.pack.id, version: selection.pack.version, revision: '0'.repeat(64),
    faceOrder: FACE_ORDER, materials: {}, blocks: {}, models: { cube: { kind: 'cube' } },
  };
  const pending: string[] = [], changed: string[] = [];
  const files = new Map<string, Buffer>();
  const processed: Array<{ id: string; before?: BlockDefinition; block: BlockDefinition }> = [];
  const seen = new Set<string>();
  for (const entry of selection.blocks) {
    const id = entry.id ?? entry.source;
    assert(isAssetId(id) && isAssetId(entry.source) && !seen.has(id), `Invalid or duplicate block: ${id}`);
    seen.add(id);
    if (options.only && !options.only.includes(id)) continue;
    if (entry.enabled === false) { pending.push(`${id}: awaiting visual selection`); continue; }
    assert(entry.review && ['preview', 'approved'].includes(entry.review.status) && entry.review.reviewer &&
      typeof entry.review.note === 'string', `Review required: ${id}`);
    const mapPath = `${entry.source}/block-map.json`;
    const mapBytes = await optionalRead(await safePath(sourceRoot, mapPath));
    if (!mapBytes) { pending.push(`${id}: block map not yet available`); continue; }
    const map = JSON.parse(mapBytes.toString('utf8').replace(/^\uFEFF/, ''));
    assert(map.block === entry.source, `Wrong source block: ${id}`);
    if (map.status !== 'generated_unreviewed') { pending.push(`${id}: ${map.status}`); continue; }
    assert(['simple', 'block_faces', 'atlas_cube', 'atlas_stateful', 'entity_atlas'].includes(map.pipeline) &&
      Array.isArray(map.faces) && Array.isArray(map.materialFiles), `Unsupported TileLab block: ${id}`);
    if (map.pipeline === 'entity_atlas') assert(entry.model?.kind === 'uv-boxes', `Reviewed UV model required for ${id}`);
    if (map.materialFiles.some((m: any) => m.animation?.frames?.some((f: any) => f.status !== 'generated_unreviewed'))) {
      pending.push(`${id}: animation frames still in progress`); continue;
    }
    const mapHash = sha256(mapBytes);
    const reports = [];
    for (const filename of ['atlas-report.json', 'entity-report.json', 'report.json']) {
      const file = `${entry.source}/${filename}`;
      const bytes = await optionalRead(await safePath(sourceRoot, file));
      if (bytes) {
        const report = JSON.parse(bytes.toString('utf8'));
        assert(report.status === 'generated_unreviewed', `Incomplete source report: ${file}`);
        reports.push(reportSummary(file, bytes, report));
      }
    }
    const materials: Record<string, MaterialDefinition> = {};
    const bindings: Record<string, string> = {};
    for (const material of map.materialFiles) {
      assert(isAssetId(material.id) && !Object.hasOwn(bindings, material.id) && typeof material.tileable === 'boolean', `Invalid TileLab material: ${id}`);
      const choice = entry.images?.[material.id];
      if (material.animation) {
        const a = material.animation;
        assert(a.mode === 'frames' && typeof a.loop === 'boolean' && a.interpolate === false &&
          Array.isArray(a.frames) && a.frames.length > 0 && a.frames.length <= 256 &&
          Array.isArray(a.timeline) && a.timeline.length > 0 && a.timeline.length <= 4096, `Unsupported animation: ${id}/${material.id}`);
        const variant = choice?.variant ?? 'raw_edit';
        assert(['raw_edit', 'repaired_seam'].includes(variant) && choice?.frames, `Reviewed frame hashes required: ${id}/${material.id}`);
        const materialId = `${id}:${material.id}`;
        const frames: NonNullable<MaterialDefinition['animation']>['frames'] = [];
        const animationReports = [...reports];
        let lighting: any;
        if (a.generationStrategy === 'fixed_master_source_lighting') {
          const file = `${entry.source}/materials/${material.id}/lighting-animation.json`, receipt = await readJson(sourceRoot, file);
          lighting = receipt.value;
          assert(lighting.version === 1 && lighting.status === 'generated_unreviewed' && lighting.geometryLocked === true &&
            lighting.localFrames === a.frames.length && typeof lighting.master === 'string', `Incomplete lighting animation: ${file}`);
          const master = await readFile(await safePath(sourceRoot, `${entry.source}/materials/${material.id}/${lighting.master}`));
          assert(sha256(master) === lighting.masterSha256, `Lighting master changed: ${file}`);
          const masterFile = `${entry.source}/materials/${material.id}/master/report.json`, masterReport = await readJson(sourceRoot, masterFile);
          assert(masterReport.value.status === 'generated_unreviewed', `Incomplete lighting master: ${masterFile}`);
          animationReports.push(reportSummary(file, receipt.bytes, lighting), reportSummary(masterFile, masterReport.bytes, masterReport.value));
        }
        const seenFrames = new Set<number>();
        for (const frame of a.frames) {
          assert(Number.isInteger(frame.sourceIndex) && frame.sourceIndex >= 0 && !seenFrames.has(frame.sourceIndex) &&
            typeof frame.output === 'string' && frame.output.startsWith(`materials/${material.id}/frames/`), `Invalid source frame: ${id}/${material.id}`);
          seenFrames.add(frame.sourceIndex);
          const folder = path.posix.dirname(frame.output);
          const image = `${entry.source}/${folder}/${variant}.png`;
          const bytes = await readFile(await safePath(sourceRoot, image)); const digest = sha256(bytes);
          assert(choice.frames[String(frame.sourceIndex)] === digest, `Reviewed frame changed: ${image}`);
          const [width, height] = pngSize(bytes);
          const file = `${entry.source}/${folder}/report.json`, r = await readJson(sourceRoot, file);
          if (lighting) assert(r.value.lightingVersion === 1 && r.value.sourceFrameIndex === frame.sourceIndex &&
            r.value.masterSha256 === lighting.masterSha256 && r.value.sourceSha256 === lighting.sourceSha256 &&
            r.value.width === width && r.value.height === height && width === lighting.width && height === lighting.height,
            `Incompatible lighting frame: ${file}`);
          assert(r.value.status === 'generated_unreviewed' && (variant !== 'raw_edit' ||
            (lighting ? r.value.outputSha256 : r.value.generatedSha256) === digest), `Incomplete/changed frame report: ${file}`);
          const texturePath = `textures/${id}/${material.id}-frame${String(frame.sourceIndex).padStart(4, '0')}-${digest}.png`;
          files.set(texturePath, bytes);
          frames.push({ sourceIndex: frame.sourceIndex, texture: { path: texturePath, sha256: digest, width, height },
            provenance: { run: path.basename(sourceRoot), block: entry.source, image, imageSha256: digest, selectedVariant: variant as 'raw_edit' | 'repaired_seam',
              blockMapSha256: mapHash, reports: [...animationReports, reportSummary(file, r.bytes, r.value)],
              isAlt: map.faces.some((f: any) => f.materialId === material.id && f.isAlt === true) } });
        }
        assert(Object.keys(choice.frames).length === frames.length, `Frame selection does not match source: ${id}/${material.id}`);
        const timeline = a.timeline.map((s: any) => {
          assert(Number.isInteger(s.frame) && s.frame >= 0 && s.frame < frames.length &&
            (s.sourceIndex === undefined || s.sourceIndex === frames[s.frame].sourceIndex) &&
            Number.isFinite(s.durationMs) && s.durationMs > 0, `Invalid source timeline: ${id}/${material.id}`);
          return { frame: s.frame, durationMs: s.durationMs };
        });
        const poster = frames[timeline[0].frame]; bindings[material.id] = materialId;
        materials[materialId] = { id: materialId, label: material.label ?? material.id, surface: material.tileable ? 'tileable' : 'bounded-face',
          texture: poster.texture, provenance: poster.provenance, roughness: 0.9, fallbackColor: '#687386', review: entry.review,
          animation: { loop: a.loop, interpolate: false, frames, timeline } };
        continue;
      }
      assert(!map.faces.some((f: any) => f.materialId === material.id && f.animation), `Missing material animation: ${id}/${material.id}`);
      const variant = choice?.variant ?? (map.pipeline === 'entity_atlas' ? 'entity_atlas_native' : 'raw_edit');
      assert(['raw_edit', 'repaired_seam', 'entity_atlas_native', 'entity_atlas_raw'].includes(variant), `Unsupported image variant: ${variant}`);
      assert(variant === 'raw_edit' || choice?.sha256, `Reviewed image hash required for alternative ${id}/${material.id}`);
      const entityImage = variant === 'entity_atlas_native' || variant === 'entity_atlas_raw';
      assert(entityImage === (map.pipeline === 'entity_atlas'), `Image variant does not match pipeline: ${id}/${material.id}`);
      const image = `${entry.source}/${entityImage ? '' : `materials/${material.id}/`}${variant}.png`;
      const bytes = await readFile(await safePath(sourceRoot, image));
      const digest = sha256(bytes);
      if (choice?.sha256) assert(digest === choice.sha256, `Reviewed image changed: ${image}`);
      const [width, height] = pngSize(bytes);
      const ownReports = [...reports];
      if (entityImage) {
        const entity = await readJson(sourceRoot, `${entry.source}/entity-report.json`);
        const recorded = variant === 'entity_atlas_raw' ? entity.value.generatedSha256 : entity.value.nativeAtlasSha256;
        assert(entity.value.status === 'generated_unreviewed' && (!recorded || recorded === digest), `Entity report hash mismatch: ${image}`);
      } else {
        const file = `${entry.source}/materials/${material.id}/report.json`;
        const r = await readJson(sourceRoot, file);
        assert(r.value.status === 'generated_unreviewed', `Incomplete material: ${file}`);
        if (variant === 'raw_edit' && r.value.generatedSha256) assert(digest === r.value.generatedSha256, `Source hash mismatch: ${image}`);
        ownReports.push(reportSummary(file, r.bytes, r.value));
      }
      const materialId = `${id}:${material.id}`;
      const texturePath = `textures/${id}/${material.id}-${digest}.png`;
      files.set(texturePath, bytes);
      bindings[material.id] = materialId;
      materials[materialId] = {
        id: materialId, label: material.label ?? material.id,
        surface: entityImage ? 'uv-atlas' : material.tileable ? 'tileable' : 'bounded-face',
        texture: { path: texturePath, sha256: digest, width, height }, roughness: 0.9, fallbackColor: '#687386',
        review: entry.review,
        provenance: { run: path.basename(sourceRoot), block: entry.source, image, imageSha256: digest,
          selectedVariant: variant, blockMapSha256: mapHash, reports: ownReports,
          isAlt: map.faces.some((f: any) => f.materialId === material.id && f.isAlt === true) },
      };
    }
    const faces = {} as FaceMaterials;
    const states: BlockDefinition['states'] = {};
    for (const face of map.faces) {
      assert(Object.hasOwn(bindings, face.materialId), `Missing face material: ${id}/${face.materialId}`);
      if (face.face === 'surface') for (const name of FACE_ORDER) faces[name] = bindings[face.materialId];
      else if (face.face === 'entity_uv_atlas' && map.pipeline === 'entity_atlas') {
        for (const name of FACE_ORDER) faces[name] = bindings[face.materialId];
      } else if (FACE_ORDER.includes(face.face)) {
        const name = face.face as BlockFace;
        assert(!faces[name], `Duplicate face: ${id}/${face.face}`);
        faces[name] = bindings[face.materialId];
      } else if (face.face.endsWith('_on') && (FACE_ORDER.includes(face.face.slice(0, -3)) || face.face === 'surface_on')) {
        const names: BlockFace[] = face.face === 'surface_on' ? [...FACE_ORDER] : [face.face.slice(0, -3) as BlockFace];
        const lit = states.lit ??= { faces: {}, emission: { faces: [], color: '#ff8b38', intensity: 0.8,
          light: { color: '#ff8b38', intensity: 4, distance: 5 } } };
        for (const name of names) { lit.faces![name] = bindings[face.materialId]; lit.emission!.faces.push(name); }
        states.unlit = {};
      } else throw new Error(`Unsupported state face: ${id}/${face.face}; provide an explicit adapter`);
    }
    assert(FACE_ORDER.every(f => faces[f]), `Incomplete six-face map: ${id}`);
    if (map.pipeline === 'entity_atlas') for (const f of FACE_ORDER) faces[f] = Object.values(bindings)[0];
    const modelId = entry.model ? `${id}:model` : 'cube';
    const block: BlockDefinition = {
      id, label: entry.label ?? id.replaceAll('_', ' '), model: modelId, faces, states: { ...states, ...entry.states },
      variants: previous?.blocks[id]?.variants ?? {}, review: entry.review,
      source: { run: path.basename(sourceRoot), block: entry.source, blockMapSha256: mapHash },
      ...(entry.variantOf ? { alternateOf: entry.variantOf } : {}),
    };
    const before = previous?.blocks[id];
    const oldMaterials = Object.fromEntries(Object.entries(previous?.materials ?? {}).filter(([key]) => key.startsWith(`${id}:`)));
    const different = serialize(before) !== serialize(block) || serialize(oldMaterials) !== serialize(materials) ||
      (entry.model && serialize(previous?.models[modelId]) !== serialize(entry.model));
    if (before && different) assert(options.replaceBlocks?.includes(id) && options.expectedRevision === previous.revision,
      `Block ${id} changed. Review it, then use --replace-block ${id} --expected-revision ${previous.revision}`);
    if (different) changed.push(id);
    for (const key of Object.keys(oldMaterials)) delete pack.materials[key];
    Object.assign(pack.materials, materials); pack.blocks[id] = block;
    if (entry.model) pack.models[modelId] = entry.model;
    processed.push({ id, before, block });
    // A writer may still be finishing a target: never accept a mixed block-map snapshot.
    assert(sha256(await readFile(await safePath(sourceRoot, mapPath))) === mapHash, `Source changed while reading ${id}; retry after completion`);
  }
  // Bind alternates after every base is present. Retain ownership so renames/removals cannot leave stale aliases.
  for (const { before } of processed) if (before?.alternateOf) {
    const target = pack.blocks[before.alternateOf.block];
    if (target) delete target.variants[before.alternateOf.name];
  }
  for (const { id, block } of processed) if (block.alternateOf) {
    const target = pack.blocks[block.alternateOf.block];
    assert(target && isAssetId(block.alternateOf.name) && serialize(pack.models[target.model]) === serialize(pack.models[block.model]), `Missing/incompatible alternate base for ${id}`);
    const old = target.variants[block.alternateOf.name];
    const appearance = { faces: block.faces };
    if (old && serialize(old) !== serialize(appearance)) assert(options.replaceBlocks?.includes(id) &&
      options.expectedRevision === previous?.revision, `Alternate binding changed: ${id}`);
    target.variants[block.alternateOf.name] = appearance;
  }
  if (options.only) assert(options.only.every(id => seen.has(id)), 'Unknown --only block');
  // Sort registries so partial and full imports converge on the same byte representation.
  for (const key of ['materials', 'blocks', 'models'] as const)
    pack[key] = Object.fromEntries(Object.entries(pack[key]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) as any;
  pack.revision = sha256(serialize({ ...pack, revision: '' }));
  validateAssetPack(pack);
  const output = serialize(pack);
  if (options.write) {
    const lock = await open(await safePath(dest, 'import.lock'), 'wx');
    try {
      const now = await optionalRead(await safePath(dest, 'manifest.json'));
      assert(now?.toString('utf8') === exists?.toString('utf8'), 'Concurrent manifest update; retry');
      // Verify existing destinations before any writes; hashed paths are immutable.
      for (const [file, bytes] of files) {
        const current = await optionalRead(await safePath(dest, file));
        assert(!current || current.equals(bytes), `Destination image was modified: ${file}`);
      }
      for (const [file, bytes] of files) {
        const target = await safePath(dest, file);
        await mkdir(path.dirname(target), { recursive: true });
        if (!await optionalRead(target)) await writeFile(target, bytes, { flag: 'wx' });
      }
      if (output !== exists?.toString('utf8')) {
        const tmp = await safePath(dest, 'manifest.pending.json');
        await writeFile(tmp, output, { flag: 'wx' });
        await rename(tmp, await safePath(dest, 'manifest.json'));
      }
    } finally { await lock.close(); await unlink(await safePath(dest, 'import.lock')); }
  }
  return { manifest: pack, changed, pending, written: !!options.write };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const get = (flag: string) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
    const source = get('--source');
    assert(source, 'Usage: npm run assets:import -- --source <TileLab run> [--only block,block] [--write] [--replace-block block --expected-revision hash]');
    const selectionFile = path.resolve(get('--selection') ?? 'scripts/asset-selections/dungeon-occult-01.json');
    const selection = JSON.parse(await readFile(selectionFile, 'utf8'));
    const destination = path.resolve(get('--destination') ?? `public/assets/material-packs/${selection.pack.id}`);
    const result = await importPack({ source, destination, selection, write: args.includes('--write'),
      only: get('--only')?.split(','), replaceBlocks: get('--replace-block')?.split(','), expectedRevision: get('--expected-revision') });
    console.log(serialize({ ...result, manifest: { id: result.manifest.id, revision: result.manifest.revision,
      blocks: Object.keys(result.manifest.blocks), materials: Object.keys(result.manifest.materials).length } }));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
