import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AnimatedMaterials, modelAnimationSample } from './AnimatedMaterials';
import { validateModelPack, validateVisualAsset, type CuboidPart, type ModelAnimation, type ModelPack, type VisualAsset, type VisualMaterial } from './contract';
import { minecraftParts } from './minecraft';
import { nativeMaterials } from './native';
import { cuboidGeometry, VisualInstance, VisualResources } from './VisualInstance';

afterEach(() => vi.restoreAllMocks());
const texture = (i: number) => ({ path: `textures/frame-${i}.png`, sha256: String(i + 1).repeat(64), width: 64, height: 64 });
const animation = (): ModelAnimation => ({ loop: true, interpolate: true,
  frames: [0, 1, 2].map(sourceIndex => ({ sourceIndex, texture: texture(sourceIndex) })),
  timeline: [{ frame: 0, durationMs: 100 }, { frame: 1, durationMs: 200 }, { frame: 2, durationMs: 300 }, { frame: 1, durationMs: 400 }] });
const animated = (): VisualMaterial => ({ ...nativeMaterials.native_stone, id: 'original-lantern', texture: texture(0), animation: animation(),
  emission: { color: '#ffffff', intensity: .3 }, render: { alphaMode: 'mask', alphaCutoff: .5, side: 'front' } });
function asset(parts: CuboidPart[]): VisualAsset {
  return { id: 'surface-fixture', label: 'Fixture', source: { kind: 'native', note: 'Synthetic' }, geometryRevision: 'test-v1',
    adapter: 'surface-parts-v1', slots: { image: { layoutId: 'solid-v1' } }, states: { neutral: { geometry: 'candidate' } },
    anchors: { socket: { position: [2, 3, 4], normal: [1, 0, 0], up: [0, 1, 0] } }, payload: { geometries: { candidate: parts } } };
}
const triangle = (): CuboidPart => ({ id: 'triangle', position: [0, 0, 0], mesh: {
  positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],
  uvs: [[0, 1], [1, 1], [0, 0]], indices: [0, 1, 2], slot: 'image' } });
function plane() {
  return minecraftParts({ textures: { image: 'block/lantern' }, elements: [{ from: [5, 2, 8], to: [11, 10, 8],
    rotation: { origin: [8, 0, 8], axis: 'y', angle: 45 }, faces: {
      north: { texture: '#image', uv: [11, 1, 14, 5] }, south: { texture: '#image', uv: [11, 1, 14, 5] } } }] },
  { 'minecraft:block/lantern': 'image' }, { prefix: 'handle', allowPlanes: true })[0];
}
function image(width = 64, height = 64) {
  const value = new Image(); Object.defineProperties(value, { naturalWidth: { value: width }, naturalHeight: { value: height } }); return value;
}
function compile(material: THREE.MeshStandardMaterial) {
  const shader = { uniforms: {}, fragmentShader: '#include <map_fragment>\n#include <emissivemap_fragment>' } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer); return shader;
}

describe('exact surface parts and shared resources', () => {
  it('preserves source handle UVs and 45-degree pivot while retaining opposite plane normals', () => {
    const part = plane(); expect(part.size).toEqual([.375, .5, 0]); expect(part.planeAxis).toBe('z');
    expect(part.pivot).toEqual([0, -.5, 0]); expect(part.rotation).toEqual([0, Math.PI / 4, 0]);
    const geometry = cuboidGeometry(part), position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    expect(geometry.groups.map(g => g.materialIndex)).toEqual([4, 5]);
    for (let i = 0; i < position.count; i++) expect(position.getZ(i)).toBe(0);
    for (const [start, sign] of [[16, 1], [20, -1]]) for (let i = start; i < start + 4; i++) {
      expect(normal.getZ(i)).toBe(sign); expect(uv.getX(i)).toBeGreaterThanOrEqual(11 / 16); expect(uv.getX(i)).toBeLessThanOrEqual(14 / 16);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(11 / 16); expect(uv.getY(i)).toBeLessThanOrEqual(15 / 16);
    }
    geometry.dispose();
  });
  it.each([
    [[0, 0, 0], [0, 1, 1], false], [[0, 0, 0], [0, 0, 1], true], [[1, 0, 0], [0, 1, 1], true],
  ])('keeps old zero-size refusal and rejects lines/negative boxes', (from, to, allowPlanes) => {
    expect(() => minecraftParts({ textures: {}, elements: [{ from, to, faces: {} }] }, {}, { prefix: 'bad', allowPlanes: allowPlanes as boolean })).toThrow('Unsupported');
  });
  it('refuses edge faces, incompatible adapters and double-sided opposing plane faces', () => {
    const part = plane(), a = asset([part]); validateVisualAsset(a);
    a.adapter = 'cuboids-v1'; expect(() => validateVisualAsset(a)).toThrow('box/plane size'); a.adapter = 'surface-parts-v1';
    part.faces!.top = { slot: 'image', rect: [0, 0, 1, 1] }; expect(() => validateVisualAsset(a)).toThrow('plane faces'); delete part.faces!.top;
    const resources = new VisualResources('/test/manifest.json'), instance = new VisualInstance(a, resources);
    expect(() => instance.bindMaterials({ image: { ...nativeMaterials.native_stone, render: { alphaMode: 'opaque', side: 'double' } } })).toThrow('front-face culling');
    instance.dispose(); resources.dispose();
  });
  it('reuses indexed geometry across appearances and keeps oriented attachment anchors instance-local', () => {
    const a = asset([triangle()]), resources = new VisualResources('/test/manifest.json');
    const first = new VisualInstance(a, resources), second = new VisualInstance(a, resources);
    first.bindMaterials({ image: nativeMaterials.native_stone }); second.bindMaterials({ image: nativeMaterials.native_wood });
    first.setVisualState('neutral'); second.setVisualState('neutral');
    const mesh = (i: VisualInstance) => i.root.getObjectByName('triangle')!.children[0] as THREE.Mesh;
    expect(mesh(first).geometry).toBe(mesh(second).geometry); expect(mesh(first).material).not.toBe(mesh(second).material);
    expect([...mesh(first).geometry.getAttribute('uv').array]).toEqual([0, 1, 1, 1, 0, 0]);
    expect([...mesh(first).geometry.index!.array]).toEqual([0, 1, 2]);
    const socket = first.anchors.get('socket')!; expect(new THREE.Vector3(0, 0, 1).applyQuaternion(socket.quaternion).toArray()).toEqual([1, 0, 2.220446049250313e-16]);
    first.root.position.x = 10; expect(second.root.position.x).toBe(0);
    const disposed = vi.fn(); mesh(first).geometry.addEventListener('dispose', disposed);
    first.dispose(); expect(disposed).not.toHaveBeenCalled(); second.dispose(); resources.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
  });
  it.each(['indices', 'normals', 'mixed'] as const)('rejects malformed indexed geometry: %s', kind => {
    const part = triangle(); if (kind === 'indices') part.mesh!.indices[2] = 3;
    if (kind === 'normals') part.mesh!.normals[0] = [0, 0, 2]; if (kind === 'mixed') part.size = [1, 1, 1];
    expect(() => validateVisualAsset(asset([part]))).toThrow('mesh');
  });
});

describe('resident keyframe animation', () => {
  it('uses elapsed time, distinct dwell times, repeated timeline entries and exact wrap boundaries', () => {
    const a = animation();
    expect(modelAnimationSample(a, -100)).toEqual({ step: 0, frame: 0, nextFrame: 1, blend: 0 });
    expect(modelAnimationSample(a, 50)).toEqual({ step: 0, frame: 0, nextFrame: 1, blend: .5 });
    expect(modelAnimationSample(a, 100)).toEqual({ step: 1, frame: 1, nextFrame: 2, blend: 0 });
    expect(modelAnimationSample(a, 800)).toEqual({ step: 3, frame: 1, nextFrame: 0, blend: .5 });
    expect(modelAnimationSample(a, 1000)).toEqual(modelAnimationSample(a, 0));
    a.loop = false; expect(modelAnimationSample(a, 2000)).toEqual({ step: 3, frame: 1, nextFrame: 1, blend: 1 });
    a.interpolate = false; expect(modelAnimationSample(a, 2000).blend).toBe(0);
  });
  it('shares three resident textures, changes only uniforms per tick and disposes once', async () => {
    const load = vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, loaded) => {
      const result = image(); queueMicrotask(() => loaded?.(result)); return result;
    });
    const library = new AnimatedMaterials('/test/manifest.json'), definition = animated();
    const material = library.material(definition); expect(library.material(structuredClone(definition))).toBe(material);
    library.tick(800); await library.ready(); expect(load).toHaveBeenCalledTimes(3); expect(library.textureCount).toBe(3);
    expect(material.transparent).toBe(false); expect(material.depthWrite).toBe(true); expect(material.side).toBe(THREE.FrontSide);
    const shader = compile(material), a = shader.uniforms.modelFrameA, b = shader.uniforms.modelFrameB, blend = shader.uniforms.modelBlend;
    expect(blend.value).toBe(.5); expect(a.value).not.toBe(b.value); expect(shader.fragmentShader).toContain('mix( texture2D( modelFrameA');
    const textures = new Set<THREE.Texture>([a.value, b.value]); library.tick(300); textures.add(shader.uniforms.modelFrameA.value);
    expect(textures.size).toBe(3); const versions = [...textures].map(t => t.version), materialVersion = material.version, dispose = vi.fn();
    for (const t of textures) t.addEventListener('dispose', dispose); material.addEventListener('dispose', dispose);
    for (let i = 0; i < 100; i++) library.tick(i * 17);
    expect([...textures].map(t => t.version)).toEqual(versions); expect(material.version).toBe(materialVersion);
    library.dispose(); library.dispose(); expect(dispose).toHaveBeenCalledTimes(4); expect(library.textureCount).toBe(0);
    expect(() => library.material(definition)).toThrow('disposed');
  });
  it('refreshes a wireframe enabled before asynchronous frame loading', async () => {
    vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, loaded) => {
      const result = image(); queueMicrotask(() => loaded?.(result)); return result;
    });
    const resources = new VisualResources('/test/manifest.json'), model = new VisualInstance(asset([triangle()]), resources);
    model.bindMaterials({ image: animated() }); model.setVisualState('neutral'); model.setWireframe(true);
    const mesh = model.root.getObjectByName('triangle')!.children[0] as THREE.Mesh;
    const before = (mesh.material as THREE.MeshStandardMaterial[])[0], disposed = vi.fn(); before.addEventListener('dispose', disposed); expect(before.map).toBeNull();
    await resources.ready(); model.setWireframe(true);
    const after = (mesh.material as THREE.MeshStandardMaterial[])[0]; expect(after).not.toBe(before); expect(disposed).toHaveBeenCalledTimes(1);
    expect(after.map).not.toBeNull(); expect(after.emissiveMap).toBe(after.map); expect(after.wireframe).toBe(true);
    expect(compile(after).fragmentShader).toContain('modelFrameA'); model.dispose(); resources.dispose();
  });
  it('rejects mismatched image dimensions without partially allocating textures', async () => {
    vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, loaded) => {
      const result = image(32); queueMicrotask(() => loaded?.(result)); return result;
    });
    const library = new AnimatedMaterials('/test/manifest.json'), material = library.material(animated());
    await library.ready(); expect(library.textureCount).toBe(0); expect(library.warnings.size).toBe(1); expect(material.map).toBeNull(); library.dispose();
  });
  it('does not allocate after disposal when pending image callbacks arrive', async () => {
    const pending: Array<() => void> = [];
    vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, loaded) => {
      const result = image(); pending.push(() => loaded?.(result)); return result;
    });
    const library = new AnimatedMaterials('/test/manifest.json'), material = library.material(animated()), disposed = vi.fn(); material.addEventListener('dispose', disposed);
    const ready = library.ready(); library.dispose(); pending.forEach(done => done()); await ready;
    expect(material.map).toBeNull(); expect(library.textureCount).toBe(0); expect(disposed).toHaveBeenCalledTimes(1);
  });
  it.each(['index', 'dimensions', 'poster', 'memory'] as const)('rejects incompatible animation: %s', kind => {
    const m = animated(), a = m.animation!;
    if (kind === 'index') a.timeline[1].frame = 5;
    if (kind === 'dimensions') a.frames[1].texture.width = 128;
    if (kind === 'poster') m.texture = texture(2);
    if (kind === 'memory') { for (const frame of a.frames) { frame.texture.width = 4096; frame.texture.height = 4096; } m.texture = a.frames[0].texture; }
    const pack: ModelPack = { schema: 'maze-visual-model-pack-v1', revision: 'test', assets: {}, bindings: {}, materials: { [m.id]: m }, provenance: { source: 'synthetic', review: 'test', warnings: [] } };
    expect(() => validateModelPack(pack)).toThrow(/animation/);
  });
});
