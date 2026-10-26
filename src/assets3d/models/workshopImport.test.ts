// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importWorkshopPreview, type WorkshopSelection } from '../../../scripts/import-workshop-preview';
import { intersectsClearance, validateWorkshopGeometry } from '../../../scripts/workshop-geometry';
import { serialize, sha256 } from '../../../scripts/import-tilelab-pack';
import { alphaPlane, cropPixels, decodeModelPng } from '../../../scripts/model-png';
import { pngImage } from './modelExport.test-support';

type V = [number, number, number];
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(file => rm(file, { recursive: true, force: true }))); });

/** Duplicated face vertices make the authored unit normals unambiguous. */
function box(id: string, min: V, max: V) {
  const positions: V[] = [], normals: V[] = [], uvs: Array<[number, number]> = [], indices: number[] = [];
  for (const axis of [0, 1, 2]) for (const sign of [-1, 1]) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3, first = positions.length;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = min.map((n, i) => (n + max[i]) / 2) as V;
      p[axis] = sign > 0 ? max[axis] : min[axis];
      p[u] += a * (max[u] - min[u]) / 2; p[v] += b * sign * (max[v] - min[v]) / 2;
      const normal: V = [0, 0, 0]; normal[axis] = sign;
      positions.push(p); normals.push(normal); uvs.push([(a + 1) / 2, (b + 1) / 2]);
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  return { id, material: 'stone', solid: true, positions, normals, uvs, indices };
}

function doorway(): any {
  return {
    schema: 'tilelab-geometry-candidate-v1', status: 'preview', runtimeAdmission: 'consumer-owned',
    assetId: 'fixture-doorway', label: 'Offline doorway', origin: 'Z:/unavailable/original/authoring.json', layoutRevision: 'offline-layout-v1',
    basis: { handedness: 'right', units: 'blocks', x: 'right', y: 'up', z: 'front' },
    bounds: { min: [-1, 0, -.25], max: [1, 2.4, .25] },
    clearances: [{ id: 'passage', min: [-.6, 0, -.3], max: [.6, 2, .3] }],
    materials: { stone: { role: 'Authored stone', color: '#786b62', uvPolicy: 'repeat-per-block' } },
    anchors: [{ id: 'lantern', position: [0, 2, 0], normal: [0, 0, 1], up: [0, 1, 0] }],
    attachments: [{ target: 'lantern', translation: [0, 2, 0], placedAnchor: [0, 2, 0],
      sourceAnchor: { position: [0, 0, 0], normal: [0, 0, -1], up: [0, 1, 0] } }],
    meshes: [box('left-jamb', [-1, 0, -.25], [-.6, 2.4, .25]), box('right-jamb', [.6, 0, -.25], [1, 2.4, .25]),
      box('lintel', [-.6, 2, -.25], [.6, 2.4, .25])],
    comparison: [{ id: 'reference-only', positions: [['invalid comparison geometry is never instantiated']] }],
  };
}

async function fixture(geometry = doorway(), extra = new Map<string, Buffer>(), reference?: any) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'maze-workshop-test-')); temporary.push(root);
  const directory = path.join(root, 'export'); await mkdir(directory);
  const payloads = new Map(extra); payloads.set('geometry.json', Buffer.from(serialize(geometry)));
  const doc: any = { schema: 'tilelab-workshop-v1', stage: 'export', admission: 'preview-only', review: 'unreviewed',
    revision: 'offline-package-v1', originalPath: 'Z:/unavailable/original/workshop.json',
    files: [...payloads].map(([file, bytes]) => ({ path: file, sha256: sha256(bytes) })), ...(reference ? { reference } : {}) };
  for (const [relative, bytes] of payloads) {
    const file = path.join(directory, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
  }
  const selection: WorkshopSelection = { schema: 'maze-workshop-selection-v1', review: 'Offline synthetic preview only', packages: [
    { directory: 'export', manifestSha256: '', revision: doc.revision, assetId: geometry.assetId },
  ] };
  const repinDescriptor = async () => {
    const bytes = Buffer.from(serialize(doc)); await writeFile(path.join(directory, 'workshop.json'), bytes);
    selection.packages[0].manifestSha256 = sha256(bytes);
  };
  await repinDescriptor();
  return { root, directory, geometry, doc, selection, repinDescriptor };
}

async function animatedFixture(change?: (source: any, role: any, files: Map<string, Buffer>) => void) {
  const geometry = doorway(), strip = { width: 2, height: 4,
    rgba: Buffer.from(Array.from({ length: 8 }, (_, i) => [10 + i * 5, 80, 120, [0, 128, 255, 255][i % 4]]).flat()) };
  const extra = new Map<string, Buffer>();
  const pin = (relative: string, bytes: Buffer) => { extra.set(`reference/${relative}`, bytes); return { path: relative, sha256: sha256(bytes) }; };
  const image = { ...pin('strip.png', pngImage(strip)), width: 2, height: 4 };
  const metadata = pin('strip.png.mcmeta', Buffer.from(serialize({ animation: { frametime: 3, frames: [1, { index: 0, time: 2 }, 1], interpolate: true } })));
  const frames = [0, 1].map(sourceIndex => {
    const pixels = cropPixels(strip, { X: 0, Y: sourceIndex * 2, Width: 2, Height: 2 });
    const selected = { ...pin(`frame-${sourceIndex}.png`, pngImage(pixels)), width: 2, height: 2 };
    return { sourceIndex, source: { ...selected }, selected };
  });
  const timeline = [{ sourceIndex: 1, frame: 1, durationMs: 150 }, { sourceIndex: 0, frame: 0, durationMs: 100 }, { sourceIndex: 1, frame: 1, durationMs: 150 }];
  const source: any = { resource: 'minecraft:block/lantern', variant: 'source_native', source: { image, alphaSha256: sha256(alphaPlane(strip)) },
    animation: { mode: 'frames', frameWidth: 2, frameHeight: 2, sourceFrameCount: 2, columns: 1, metadata, frames, timeline, interpolate: true, loop: true } };
  const role: any = { role: 'Original reference', color: '#ffffff', uvPolicy: 'normalized-source-atlas', sourceResource: source.resource,
    frames: frames.map(frame => `reference/${frame.selected.path}`), timeline: structuredClone(timeline), interpolate: true, loop: true };
  change?.(source, role, extra);
  geometry.materials.stone = role;
  const doc = { schema: 'tilelab-material-export-v2', revision: 'offline-originals-v2', selectionStatus: 'complete', colorSpace: 'srgb',
    uvBasis: { mapping: 'full-canvas' }, alphaPolicy: 'exact_source_alpha_at_nearest_source_texel', materials: [source],
    files: [...extra].map(([relative, bytes]) => ({ path: relative.slice('reference/'.length), sha256: sha256(bytes) })) };
  const manifest = Buffer.from(serialize(doc)); extra.set('reference/material-export.json', manifest);
  return fixture(geometry, extra, { manifest: 'reference/material-export.json', manifestSha256: sha256(manifest), revision: doc.revision,
    credits: ['Offline fixture credit'], warnings: ['Original reference art only'] });
}

async function savedTileFixture(change?: (role: any) => void) {
  const geometry = doorway(), image = pngImage({ width: 2, height: 2, rgba: Buffer.from([110, 70, 20, 128, 100, 60, 10, 255, 120, 80, 30, 255, 90, 50, 5, 0]) });
  const role: any = { role: 'bark', color: '#49331e', uvPolicy: 'repeat-per-block', frames: ['textures/wood.png'], alphaMode: 'opaque',
    interpolate: false, loop: true, timeline: [{ durationMs: 1000, frame: 0 }],
    provenance: { sha256: sha256(image), dimensions: [2, 2], sourceRun: 'retained-offline-run', selectedFile: 'oak_log/repaired_seam.png' } };
  change?.(role); geometry.materials.stone = role;
  return fixture(geometry, new Map([['textures/wood.png', image]]), { kind: 'saved-tilelab-run-textures', revision: 'offline-saved-tiles' });
}

describe('saved static workshop tiles', () => {
  it('retains exact texture bytes and provenance with explicit opaque rendering and physical repeats', async () => {
    const f = await savedTileFixture(), result = await importWorkshopPreview(f.root, f.selection), material = Object.values(result.pack.materials)[0];
    expect(material.surface).toBe('tileable'); expect(material.animation).toBeUndefined();
    expect(material.render).toEqual({ alphaMode: 'opaque', side: 'front' });
    expect(result.files.get(material.texture!.path)).toEqual(await readFile(path.join(f.directory, 'textures/wood.png')));
    expect(result.files.has('evidence/fixture-doorway/geometry.json')).toBe(true);
  });
  it('keeps end-grain caps bounded instead of repeating them', async () => {
    const f = await savedTileFixture(role => { role.uvPolicy = 'normalized-source-atlas'; });
    expect(Object.values((await importWorkshopPreview(f.root, f.selection)).pack.materials)[0].surface).toBe('bounded-face');
  });
  it.each(['digest', 'dimensions', 'frames', 'timing', 'alpha'])('refuses inconsistent saved tile %s even inside a repinned package', async fault => {
    const f = await savedTileFixture(role => {
      if (fault === 'digest') role.provenance.sha256 = '0'.repeat(64);
      if (fault === 'dimensions') role.provenance.dimensions = [4, 4];
      if (fault === 'frames') role.frames.push('textures/wood.png');
      if (fault === 'timing') role.timeline[0].durationMs = 50;
      if (fault === 'alpha') role.alphaMode = 'blend';
    });
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow(/saved tile/);
  });
});

describe('portable pinned workshop intake', () => {
  it('imports only finite authored candidate meshes, preserving proof, anchors, material and UV conversion', async () => {
    const f = await fixture(), before = await readFile(path.join(f.directory, 'geometry.json'));
    const result = await importWorkshopPreview(f.root, f.selection), asset = result.pack.assets['fixture-doorway'];
    expect(asset.adapter).toBe('surface-parts-v1'); expect(asset.geometryRevision).toBe(sha256(before));
    expect(asset.payload.geometries.candidate.map(part => part.id)).toEqual(['left-jamb', 'right-jamb', 'lintel']);
    expect(asset.payload.geometries.candidate[0].mesh).toMatchObject({ positions: f.geometry.meshes[0].positions,
      normals: f.geometry.meshes[0].normals, indices: f.geometry.meshes[0].indices, uvs: f.geometry.meshes[0].uvs.map(([u, v]: [number, number]) => [u, 1 - v]) });
    expect(asset.anchors?.lantern).toEqual({ position: [0, 2, 0], normal: [0, 0, 1], up: [0, 1, 0] });
    expect(asset.placement).toEqual({ bounds: f.geometry.bounds, clearances: f.geometry.clearances });
    expect(Object.values(result.pack.materials)[0]).toMatchObject({ fallbackColor: '#786b62', layoutId: 'offline-layout-v1:stone', render: { alphaMode: 'opaque' } });
    const evidence = JSON.parse(result.files.get('evidence/intake.json')!.toString());
    expect(evidence.evidence[0]).toMatchObject({ gameplayAdmission: false, comparisonMeshesInstantiated: false,
      geometrySha256: sha256(before), proof: { meshes: 3, vertices: 72, triangles: 36, clearances: 1, comparisonMeshesIgnored: 1 } });
    expect(result.files.get('evidence/fixture-doorway/geometry.json')).toEqual(before);
    expect(await readFile(path.join(f.directory, 'geometry.json'))).toEqual(before);
  });

  it('is deterministic after relocation and removal of the original package, without historical path reads', async () => {
    const f = await fixture(), first = await importWorkshopPreview(f.root, f.selection);
    const moved = await mkdtemp(path.join(os.tmpdir(), 'maze-workshop-moved-')); temporary.push(moved);
    await cp(f.directory, path.join(moved, 'export'), { recursive: true }); await rm(f.root, { recursive: true });
    const second = await importWorkshopPreview(moved, f.selection), third = await importWorkshopPreview(moved, f.selection);
    expect(second.pack).toEqual(first.pack); expect([...second.files]).toEqual([...first.files]); expect(third).toEqual(second);
  });

  it('rejects changed descriptor bytes before trusting its payload pins', async () => {
    const f = await fixture(); await writeFile(path.join(f.directory, 'workshop.json'), `${serialize(f.doc)} `);
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('workshop descriptor changed');
  });

  it('rejects changed pinned geometry bytes', async () => {
    const f = await fixture(); await writeFile(path.join(f.directory, 'geometry.json'), `${serialize(f.geometry)} `);
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('changed/oversized geometry.json');
  });

  it.each(['../outside.json', '/absolute.json', 'C:/absolute.json', 'nested/../../outside.json', 'nested\\outside.json'])('rejects unsafe payload pin %s even with a repinned manifest', async unsafe => {
    const f = await fixture(); f.doc.files.push({ path: unsafe, sha256: sha256('outside') }); await f.repinDescriptor();
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow(/Unsafe relative path|Path outside root/);
  });

  it('rejects unsafe package paths and duplicate payload pins', async () => {
    const f = await fixture(); f.selection.packages[0].directory = '../export';
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('Unsafe relative path');
    f.selection.packages[0].directory = 'export'; f.doc.files.push({ ...f.doc.files[0] }); await f.repinDescriptor();
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('invalid/duplicate pin');
  });

  it.each([['schema', 'future-workshop'], ['stage', 'draft'], ['admission', 'runtime'], ['revision', 'different-revision']])('rejects unsupported package %s', async (key, value) => {
    const f = await fixture(); f.doc[key] = value; await f.repinDescriptor();
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('unsupported package stage/bounds');
  });

  it('rejects candidate identity mismatches and missing geometry closure', async () => {
    const f = await fixture(); f.selection.packages[0].assetId = 'another-doorway';
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('asset identity differs');
    f.selection.packages[0].assetId = f.geometry.assetId; f.doc.files = []; await f.repinDescriptor();
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('missing payload geometry.json');
  });
});

describe('workshop convex geometry and clearance qualification', () => {
  it('permits shared boundaries but rejects a solid obstructing the doorway', () => {
    expect(validateWorkshopGeometry(doorway()).triangles).toBe(36);
    const g = doorway(); g.meshes.push(box('blocker', [-.1, 0, -.1], [.1, 1, .1]));
    expect(() => validateWorkshopGeometry(g)).toThrow('blocked clearance passage/blocker');
  });

  it('uses the convex solid rather than its overlapping AABB for rotated geometry', () => {
    const mesh = box('rotated', [-1, 0, -1], [1, 1, 1]);
    const rotate = ([x, y, z]: V): V => [(x - z) / Math.SQRT2, y, (x + z) / Math.SQRT2];
    mesh.positions = mesh.positions.map(rotate); mesh.normals = mesh.normals.map(rotate);
    const outside = { id: 'corner', min: [1.1, .2, 1.1] as V, max: [1.3, .8, 1.3] as V };
    expect(mesh.positions.some(p => p[0] > outside.min[0])).toBe(true);
    expect(mesh.positions.some(p => p[2] > outside.min[2])).toBe(true);
    expect(intersectsClearance(mesh, outside)).toBe(false);
    const g = doorway(); g.meshes = [mesh]; g.bounds = { min: [-1.5, 0, -1.5], max: [1.5, 1, 1.5] }; g.clearances = [outside];
    expect(() => validateWorkshopGeometry(g)).not.toThrow();
    expect(intersectsClearance(mesh, { min: [-.1, .2, -.1], max: [.1, .8, .1] })).toBe(true);
  });

  it.each([
    ['unknown schema', (g: any) => { g.schema = 'unknown'; }, /schema\/basis/],
    ['nonfinite coordinate', (g: any) => { g.meshes[0].positions[0][0] = Infinity; }, /mesh left-jamb/],
    ['invalid normal', (g: any) => { g.meshes[0].normals[0] = [0, 0, 0]; }, /mesh left-jamb/],
    ['nonfinite UV', (g: any) => { g.meshes[0].uvs[0][0] = NaN; }, /mesh left-jamb/],
    ['out-of-range index', (g: any) => { g.meshes[0].indices[0] = 1000; }, /mesh left-jamb/],
    ['degenerate triangle', (g: any) => { g.meshes[0].indices[1] = g.meshes[0].indices[0]; }, /degenerate triangle\/winding/],
    ['reversed winding', (g: any) => { g.meshes[0].indices.splice(0, 3, 0, 2, 1); }, /degenerate triangle\/winding/],
    ['undeclared material', (g: any) => { g.meshes[0].material = 'unknown'; }, /mesh left-jamb/],
    ['parallel anchor basis', (g: any) => { g.anchors[0].up = [0, 0, 1]; }, /anchor basis/],
    ['misaligned attachment', (g: any) => { g.attachments[0].placedAnchor[0] = .1; }, /attachment alignment/],
    ['unnormalized source attachment', (g: any) => { g.attachments[0].sourceAnchor.normal = [1, 0, -1]; g.attachments[0].sourceAnchor.up = [1, 1, 0]; }, /attachment alignment/],
    ['out-of-bounds vertex', (g: any) => { g.bounds.max[1] = 2.3; }, /declared bounds/],
    ['duplicate meshes', (g: any) => { g.meshes.push(structuredClone(g.meshes[0])); }, /mesh count\/identity/],
    ['nonconvex solid', (g: any) => { g.meshes[0].positions.push([0, 1, 0]); g.meshes[0].normals.push([1, 0, 0]); g.meshes[0].uvs.push([0, 0]); }, /nonconvex solid/],
  ])('rejects malformed candidate: %s', (_name, mutate, message) => {
    const g = doorway(); (mutate as (g: any) => void)(g); expect(() => validateWorkshopGeometry(g)).toThrow(message as RegExp);
  });
});

describe('workshop original-source animation admission', () => {
  it('retains source frame identity, repeated timeline, ticks, interpolation, alpha and poster', async () => {
    const f = await animatedFixture(), result = await importWorkshopPreview(f.root, f.selection), material = Object.values(result.pack.materials)[0];
    expect(material.animation).toMatchObject({ loop: true, interpolate: true, frames: [{ sourceIndex: 0 }, { sourceIndex: 1 }],
      timeline: [{ frame: 1, durationMs: 150 }, { frame: 0, durationMs: 100 }, { frame: 1, durationMs: 150 }] });
    expect(material.texture).toEqual(material.animation!.frames[1].texture);
    expect(material.render).toEqual({ alphaMode: 'mask', alphaCutoff: .5, side: 'front' });
    for (const frame of material.animation!.frames) expect(result.files.get(frame.texture.path)).toEqual(await readFile(path.join(f.directory, `reference/frame-${frame.sourceIndex}.png`)));
    expect(result.pack.provenance.warnings).toContain('Offline fixture credit');
  });

  it.each(['upgraded', 'raw_edit'])('rejects %s reference frames even with complete valid hashes', async variant => {
    const f = await animatedFixture(source => { source.variant = variant; });
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('only selected original reference animation is admitted');
  });

  it('rejects altered consumer timing and selected source-frame identities', async () => {
    const timing = await animatedFixture((_source, role) => { role.timeline[0].durationMs = 50; });
    await expect(importWorkshopPreview(timing.root, timing.selection)).rejects.toThrow('animation timing/interpolation differs');
    const frame = await animatedFixture((_source, role) => { role.frames.reverse(); });
    await expect(importWorkshopPreview(frame.root, frame.selection)).rejects.toThrow('selected frame differs');
  });

  it('rejects a fully repinned selected PNG whose crop pixels differ from the original strip', async () => {
    const f = await animatedFixture((source, _role, files) => {
      const frame = source.animation.frames[0], relative = `reference/${frame.selected.path}`;
      const decoded = decodeModelPng(files.get(relative)!); decoded.rgba[0]++;
      const bytes = pngImage(decoded); files.set(relative, bytes);
      frame.selected.sha256 = sha256(bytes); frame.source.sha256 = sha256(bytes);
    });
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('source crop pixels differ');
  });

  it.each(['alpha', 'strip dimensions'])('rejects inconsistent original source %s evidence', async fault => {
    const f = await animatedFixture(source => {
      if (fault === 'alpha') source.source.alphaSha256 = '0'.repeat(64);
      else source.animation.sourceFrameCount++;
    });
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('source strip/alpha differs');
  });

  it('rejects unsupported static source atlas roles', async () => {
    const g = doorway(); g.materials.stone.sourceResource = 'minecraft:block/lantern';
    const f = await fixture(g);
    await expect(importWorkshopPreview(f.root, f.selection)).rejects.toThrow('unsupported material role');
  });
});
