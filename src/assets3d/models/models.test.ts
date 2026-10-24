import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { FACE_ORDER } from '../manifest';
import { nativeLever, nativeMaterials } from './native';
import { minecraftParts, resolveMinecraftModel, resolveTexture } from './minecraft';
import { VisualInstance, VisualResources, cuboidGeometry } from './VisualInstance';
import { validateVisualAsset } from './contract';
import { ThreeAssetLibrary } from '../threeAssets';

describe('curated model adapters', () => {
  it('honors child texture overrides, rejects missing concrete parents and both cycle types', () => {
    const models = { base: { textures: { a: 'block/stone' }, elements: [] }, child: { parent: 'base', textures: { a: 'block/iron' } } };
    const names = Object.fromEntries(Object.entries(models).map(([k, v]) => [`minecraft:${k}`, v]));
    expect(resolveMinecraftModel('minecraft:child', names).textures.a).toBe('block/iron');
    expect(() => resolveMinecraftModel('minecraft:missing', names, true)).toThrow('Missing concrete');
    expect(resolveMinecraftModel('minecraft:block/block', names, true).elements).toEqual([]);
    expect(() => resolveMinecraftModel('minecraft:a', { 'minecraft:a': { parent: 'a' } })).toThrow('Cyclic');
    expect(() => resolveTexture('#a', { a: '#b', b: '#a' })).toThrow('Cyclic');
  });
  it('maps a mirrored, rotated UV16 face without image-size dependence and omits absent faces', () => {
    const parts = minecraftParts({ textures: { image: 'block/a' }, elements: [{ from: [0, 0, 0], to: [16, 16, 16],
      faces: { south: { texture: '#image', uv: [16, 0, 0, 16], rotation: 90 }, north: { texture: '#image', uv: [0, 0, 16, 16] } } }] },
    { 'minecraft:block/a': 'atlas' }, { prefix: 'p' });
    const geometry = cuboidGeometry(parts[0]), uv = geometry.getAttribute('uv');
    expect(geometry.groups.map(g => FACE_ORDER[g.materialIndex!])).toEqual(['front', 'back']);
    // Front's top-left vertex samples the mirrored image's bottom-right after the quarter-turn.
    expect([uv.getX(16), uv.getY(16)]).toEqual([1, 0]);
    expect([uv.getX(17), uv.getY(17)]).toEqual([1, 1]);
    // Back remains upright and uses the opposite face's own mapping.
    expect([uv.getX(20), uv.getY(20)]).toEqual([0, 1]);
    geometry.dispose();
  });
  it('preserves element rotation, rescale and a noncentral pivot', () => {
    const [part] = minecraftParts({ textures: { a: 'block/a' }, elements: [{ from: [4, 0, 4], to: [12, 8, 12],
      rotation: { origin: [8, 0, 8], axis: 'z', angle: 45, rescale: true }, faces: { up: { texture: '#a', uv: [0, 0, 16, 16] } } }] },
    { 'minecraft:block/a': 'top' }, { prefix: 'rot' });
    expect(part.pivot).toEqual([0, -0.5, 0]);
    expect(part.scale![0]).toBeCloseTo(Math.sqrt(2));
    const asset = nativeLever(); asset.slots = { top: { layoutId: 'solid-v1' } }; asset.payload.geometries = { test: [part] }; asset.states = { test: { geometry: 'test' } };
    const resources = new VisualResources('/test/manifest.json'), model = new VisualInstance(asset, resources);
    model.bindMaterials({ top: nativeMaterials.native_stone }); model.setVisualState('test'); model.root.updateMatrixWorld(true);
    const mesh = model.root.getObjectByName('rot-0')!.children[0];
    const center = mesh.getWorldPosition(new THREE.Vector3());
    expect(center.x).toBeCloseTo(-0.25); expect(center.y).toBeCloseTo(-0.25);
    model.dispose(); resources.dispose();
  });
});

describe('source-independent instances and resources', () => {
  it('switches state and material independently without rebuilding shared geometry or moving another instance', () => {
    const asset = nativeLever(), resources = new VisualResources('/test/manifest.json');
    const a = new VisualInstance(asset, resources), b = new VisualInstance(asset, resources);
    const materials = { mount: nativeMaterials.native_stone, handle: nativeMaterials.native_bronze };
    for (const model of [a, b]) { model.bindMaterials(materials); model.setVisualState('off'); }
    const count = resources.geometryCount, old = a.root.getObjectByName('shaft')!.children[0] as THREE.Mesh;
    for (let i = 0; i < 30; i++) {
      a.setVisualState(i % 2 ? 'on' : 'off'); a.bindMaterials({ mount: nativeMaterials.native_wood, handle: nativeMaterials.native_bronze });
    }
    expect(resources.geometryCount).toBe(count); expect((a.root.getObjectByName('shaft')!.children[0] as THREE.Mesh).geometry).toBe(old.geometry);
    expect(a.currentState).toBe('on'); expect(b.currentState).toBe('off');
    expect(() => a.setVisualState('powered')).toThrow('Unsupported');
    expect(() => a.bindMaterials({ ...materials, mount: { ...materials.mount, layoutId: 'unrelated' } })).toThrow('Incompatible');
    a.dispose(); expect(resources.geometryCount).toBe(count); expect(() => a.setVisualState('off')).toThrow('disposed');
    b.dispose(); resources.dispose(); expect(resources.geometryCount).toBe(0);
  });
  it('rejects missing/cyclic joints and invalid poses before rendering', () => {
    const asset = nativeLever(); asset.payload.geometries.lever[0].parent = 'grip'; asset.payload.geometries.lever[4].parent = 'mount';
    expect(() => validateVisualAsset(asset)).toThrow('parent cycle');
    const other = nativeLever(); other.states.off.poses = { absent: [0, 0, 0] };
    expect(() => validateVisualAsset(other)).toThrow('state pose');
  });
  it('keeps binary cutouts depth-writing and separates render-policy cache entries', async () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, loaded) => {
      const texture = new THREE.Texture<HTMLImageElement>(); queueMicrotask(() => loaded?.(texture)); return texture;
    });
    const library = new ThreeAssetLibrary(() => {}, '/test/manifest.json');
    const material = { ...nativeMaterials.native_stone, texture: { path: 'textures/a.png', sha256: 'a'.repeat(64), width: 64, height: 64 },
      render: { alphaMode: 'mask' as const, alphaCutoff: 0.5, side: 'front' as const } };
    const a = library.material({ face: 'front', material, fallbackColor: '#ffffff' });
    const b = library.material({ face: 'front', material: { ...material, render: { ...material.render, alphaCutoff: 0.1 } }, fallbackColor: '#ffffff' });
    expect(a).not.toBe(b); expect(a.alphaTest).toBe(0.5); expect(a.transparent).toBe(false); expect(a.depthWrite).toBe(true); expect(a.side).toBe(THREE.FrontSide);
    await library.ready(); expect(a.map).toBe(b.map); library.dispose(); vi.restoreAllMocks();
  });
});
