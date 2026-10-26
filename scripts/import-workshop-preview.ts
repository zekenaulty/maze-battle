import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safePath, sha256, serialize } from './import-tilelab-pack.ts';
import { decodeModelPng, cropPixels, alphaPlane } from './model-png.ts';
import { validateWorkshopGeometry } from './workshop-geometry.ts';
import { validateModelPack, type ModelPack, type VisualAsset, type VisualMaterial } from '../src/assets3d/models/contract.ts';

export interface WorkshopSelection { schema: 'maze-workshop-selection-v1'; review: string;
  packages: Array<{ directory: string; manifestSha256: string; revision: string; assetId: string }> }
function check(ok: unknown, reason: string): asserts ok { if (!ok) throw Error(`Workshop intake: ${reason}`); }
const json = (b: Buffer) => JSON.parse(b.toString('utf8').replace(/^\uFEFF/, ''));
export async function importWorkshopPreview(root: string, selection: WorkshopSelection) {
  check(selection.schema === 'maze-workshop-selection-v1' && typeof selection.review === 'string' && selection.review.length > 0
    && Array.isArray(selection.packages) && selection.packages.length > 0 && selection.packages.length <= 4, 'explicit selection required');
  const pack: ModelPack = { schema: 'maze-visual-model-pack-v1', revision: '', assets: {}, materials: {}, bindings: {},
    provenance: { source: 'tilelab-workshop-preview-v1', review: selection.review, warnings: ['Workshop preview only; no dungeon admission or collision authority.', 'Authored stone/iron colors are placeholders. Reference lantern art remains reference-derived.'] } };
  const files = new Map<string, Buffer>(), evidence: unknown[] = [];
  for (const choice of selection.packages) {
    check(!pack.assets[choice.assetId], 'duplicate selected asset');
    const directory = await safePath(root, choice.directory), bytes = await readFile(await safePath(directory, 'workshop.json'));
    check(sha256(bytes) === choice.manifestSha256, 'workshop descriptor changed'); const doc = json(bytes);
    check(doc.schema === 'tilelab-workshop-v1' && doc.stage === 'export' && doc.admission === 'preview-only'
      && doc.review === 'unreviewed' && doc.revision === choice.revision && Array.isArray(doc.files) && doc.files.length <= 256, 'unsupported package stage/bounds');
    const pins = new Map<string, Buffer>(); let total = 0;
    for (const pin of doc.files) {
      check(typeof pin.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256) && !pins.has(pin.path), 'invalid/duplicate pin');
      const bytes = await readFile(await safePath(directory, pin.path)); total += bytes.length;
      check(bytes.length <= 16 * 1024 ** 2 && total <= 64 * 1024 ** 2 && sha256(bytes) === pin.sha256, `changed/oversized ${pin.path}`);
      pins.set(pin.path, bytes); files.set(`evidence/${choice.assetId}/${pin.path}`, bytes);
    }
    const pinned = (file: string) => { const b = pins.get(file); check(b, `missing payload ${file}`); return b; };
    files.set(`evidence/${choice.assetId}/workshop.json`, bytes);
    const g = json(pinned('geometry.json')), proof = validateWorkshopGeometry(g); check(g.assetId === choice.assetId, 'asset identity differs');
    const bindings: Record<string, string> = {}, slots: VisualAsset['slots'] = {};
    let sourceDoc: any;
    if (doc.reference) {
      const original = pinned(doc.reference.manifest); check(sha256(original) === doc.reference.manifestSha256, 'reference manifest differs');
      sourceDoc = json(original); check(sourceDoc.schema === 'tilelab-material-export-v2' && sourceDoc.revision === doc.reference.revision
        && sourceDoc.selectionStatus === 'complete' && sourceDoc.colorSpace === 'srgb' && sourceDoc.uvBasis?.mapping === 'full-canvas'
        && sourceDoc.alphaPolicy === 'exact_source_alpha_at_nearest_source_texel', 'unsupported reference');
      for (const pin of sourceDoc.files) check(sha256(pinned(`reference/${pin.path}`)) === pin.sha256, 'reference closure differs');
      pack.provenance.warnings.push(...(doc.reference.credits ?? []), ...(doc.reference.warnings ?? []));
    }
    for (const [role, value] of Object.entries(g.materials) as Array<[string, any]>) {
      const id = `workshop-${sha256(`${choice.assetId}/${role}`).slice(0, 16)}`, slot = `role-${sha256(role).slice(0, 12)}`;
      const material: VisualMaterial = { id, label: value.role, layoutId: `${g.layoutRevision}:${role}`, surface: 'bounded-face',
        fallbackColor: value.color, roughness: .85, render: { alphaMode: 'opaque', side: 'front' } };
      if (value.frames) {
        const source = sourceDoc?.materials.find((m: any) => m.resource === value.sourceResource);
        check(value.uvPolicy === 'normalized-source-atlas' && source?.variant === 'source_native' && source.animation?.mode === 'frames'
          && source.animation.frames.length === value.frames.length && value.frames.length <= 32, 'only selected original reference animation is admitted');
        const a = source.animation, strip = decodeModelPng(pinned(`reference/${source.source.image.path}`));
        check(strip.width === a.frameWidth && strip.height === a.frameHeight * a.sourceFrameCount && a.columns === 1
          && sha256(alphaPlane(strip)) === source.source.alphaSha256, 'source strip/alpha differs');
        const meta = json(pinned(`reference/${a.metadata.path}`)).animation;
        const timeline = (meta.frames ?? Array.from({ length: a.sourceFrameCount }, (_, i) => i)).map((entry: any) => {
          const index = typeof entry === 'number' ? entry : entry.index, ticks = typeof entry === 'number' ? meta.frametime ?? 1 : entry.time ?? meta.frametime ?? 1;
          check(Number.isInteger(index) && index >= 0 && index < a.sourceFrameCount && Number.isInteger(ticks) && ticks > 0, 'metadata frame/time');
          const frame = a.frames.findIndex((f: any) => f.sourceIndex === index); check(frame >= 0, 'missing source frame');
          return { sourceIndex: index, frame, durationMs: ticks * 50 };
        });
        check(serialize(timeline) === serialize(a.timeline) && serialize(a.timeline) === serialize(value.timeline)
          && a.interpolate === !!meta.interpolate && value.interpolate === a.interpolate && value.loop === a.loop, 'animation timing/interpolation differs');
        const frames = a.frames.map((frame: any, i: number) => {
          check(value.frames[i] === `reference/${frame.selected.path}` && frame.selected.sha256 === frame.source.sha256, 'selected frame differs');
          const bytes = pinned(value.frames[i]), decoded = decodeModelPng(bytes);
          const crop = cropPixels(strip, { X: 0, Y: frame.sourceIndex * a.frameHeight, Width: a.frameWidth, Height: a.frameHeight });
          check(decoded.width === a.frameWidth && decoded.height === a.frameHeight && decoded.rgba.equals(crop.rgba), 'source crop pixels differ');
          const hash = sha256(bytes), texture = { path: `textures/${hash}.png`, sha256: hash, width: decoded.width, height: decoded.height };
          files.set(texture.path, bytes); return { sourceIndex: frame.sourceIndex, texture };
        });
        material.animation = { frames, loop: a.loop, interpolate: a.interpolate, timeline: a.timeline.map((s: any) => ({ frame: s.frame, durationMs: s.durationMs })) };
        material.texture = frames[a.timeline[0].frame].texture; material.surface = 'uv-atlas'; material.render = { alphaMode: 'mask', alphaCutoff: .5, side: 'front' };
        material.emission = { color: '#ffffff', intensity: .3 };
      } else check(value.uvPolicy === 'repeat-per-block' && !value.sourceResource, 'unsupported material role');
      pack.materials[id] = material; bindings[slot] = id; slots[slot] = { layoutId: material.layoutId };
    }
    const asset: VisualAsset = { id: choice.assetId, label: g.label, geometryRevision: sha256(pinned('geometry.json')),
      source: { kind: 'tilelab-construction', note: `${g.origin}; preview from pinned workshop package, not gameplay authority.`,
        files: [{ path: `evidence/${choice.assetId}/workshop.json`, sha256: choice.manifestSha256 }] },
      adapter: 'surface-parts-v1', slots, states: { neutral: { geometry: 'candidate' } },
      anchors: Object.fromEntries(g.anchors.map((a: any) => [a.id, { position: a.position, normal: a.normal, up: a.up }])),
      placement: { bounds: g.bounds, clearances: g.clearances.map((c: any) => ({ id: c.id, min: c.min, max: c.max })) },
      payload: { geometries: { candidate: g.meshes.map((m: any) => ({ id: m.id, position: [0, 0, 0], mesh: {
        positions: m.positions, normals: m.normals, uvs: m.uvs.map(([u, v]: [number, number]) => [u, 1 - v]),
        indices: m.indices, slot: `role-${sha256(m.material).slice(0, 12)}` } })) } } };
    pack.assets[asset.id] = asset; pack.bindings[asset.id] = bindings;
    evidence.push({ choice, proof, geometrySha256: asset.geometryRevision, geometryLayoutRevision: g.layoutRevision, sourceFingerprint: doc.reference?.manifestSha256,
      comparisonMeshesInstantiated: false, uvConversion: 'top-left to bottom-left; v=1-v', gameplayAdmission: false });
  }
  files.set('evidence/intake.json', Buffer.from(serialize({ schema: 'maze-workshop-intake-v1', selection, evidence })));
  pack.revision = sha256(serialize(pack)); validateModelPack(pack); return { pack, files };
}
async function main() {
  const args = process.argv.slice(2), option = (key: string) => args[args.indexOf(key) + 1];
  check(args.includes('--source') && args.includes('--selection'), 'use --source ROOT --selection JSON [--write]');
  const result = await importWorkshopPreview(path.resolve(option('--source')), json(await readFile(option('--selection'))));
  if (args.includes('--write')) {
    const destination = path.resolve('public/assets/model-packs/lighting'); await mkdir(destination, { recursive: true });
    for (const [relative, bytes] of result.files) { const file = await safePath(destination, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
    const temporary = await safePath(destination, `manifest-${process.pid}.tmp`); await writeFile(temporary, serialize(result.pack)); await rename(temporary, await safePath(destination, 'manifest.json'));
  }
  console.log(JSON.stringify({ revision: result.pack.revision, assets: Object.keys(result.pack.assets), files: result.files.size, write: args.includes('--write') }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
