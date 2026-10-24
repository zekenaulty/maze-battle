// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HUMANOID_HEIGHT, validateAppearance, validateSkinCatalog, validateSkinDimensions } from './contract';
import type { HumanoidAppearance, SkinCatalog } from './contract';
import { HumanoidResources } from './HumanoidResources';
import { HumanoidModel } from './HumanoidModel';
import { HumanoidLineup } from './HumanoidLineup';
import { humanoidPose } from './animation';
import { PARTS } from './uv';

const catalog: SkinCatalog = { schemaVersion: 1, revision: 'a'.repeat(64), skins: [64, 512].map(size => ({
  id: `skin-${size}`, label: `${size}`, layout: 'minecraft-64x64', model: 'classic',
  texture: { path: `textures/skin-${size}.png`, sha256: 'b'.repeat(64), width: size, height: size },
  provenance: { run: 'test-run', sourceId: 'test-skin', image: 'skin_upgraded.png', imageSha256: 'b'.repeat(64), reportSha256: 'c'.repeat(64), rawSheetSha256: 'd'.repeat(64), kind: 'generated', status: 'preview' },
})) };
const appearance: HumanoidAppearance = { id: 'player-or-npc', model: 'classic', skinAssetId: 'skin-512', scale: 1, outerLayerVisible: true };
function loadTextures() {
  vi.stubGlobal('location', { href: 'http://localhost/' });
  return vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, onLoad) => {
    const size = url.includes('skin-512') ? 512 : 64;
    const texture = new THREE.Texture({ naturalWidth: size, naturalHeight: size } as HTMLImageElement); onLoad?.(texture); return texture;
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function uvRect(geometry: THREE.BufferGeometry, face: number) {
  const uv = geometry.getAttribute('uv'), points = [0, 1, 2, 3].map(i => [uv.getX(face * 4 + i) * 64, (1 - uv.getY(face * 4 + i)) * 64]);
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
describe('humanoid contract and reference mapping', () => {
  it('admits standard HD/ordinary atlases and rejects incompatible shapes and descriptors', () => {
    for (const size of [64, 128, 256, 512, 1024, 2048]) expect(() => validateSkinDimensions(size, size)).not.toThrow();
    for (const [w, h] of [[64, 32], [1024, 512], [96, 96], [0, 0]]) expect(() => validateSkinDimensions(w, h)).toThrow('Incompatible skin');
    validateSkinCatalog(catalog); validateAppearance(appearance);
    expect(() => validateAppearance({ ...appearance, scale: NaN })).toThrow();
    const invalid = structuredClone(catalog); invalid.skins[0].layout = 'face-sheet' as any;
    expect(() => validateSkinCatalog(invalid)).toThrow('layout');
  });
  it('maps every head face in the verified direction, including the reversed bottom face', () => {
    const resources = new HumanoidResources(catalog), head = resources.geometry('head', false, false);
    expect([0, 1, 2, 3, 4, 5].map(f => uvRect(head, f))).toEqual([
      [16, 8, 24, 16], [0, 8, 8, 16], [8, 0, 16, 8], [16, 0, 24, 8], [8, 8, 16, 16], [24, 8, 32, 16],
    ]);
    const uv = head.getAttribute('uv');
    expect([uv.getX(16), uv.getY(16), uv.getX(17), uv.getY(18)]).toEqual([8 / 64, 1 - 8 / 64, 16 / 64, 1 - 16 / 64]);
    expect([uv.getX(12), uv.getY(12), uv.getY(14)]).toEqual([16 / 64, 1 - 8 / 64, 1]);
    resources.dispose();
  });
  it('uses distinct limb islands, correct classic/slim widths, and resolution-independent UVs', () => {
    const r = new HumanoidResources(catalog);
    expect(uvRect(r.geometry('rightArm', false, false), 4)).toEqual([44, 20, 48, 32]);
    expect(uvRect(r.geometry('leftArm', false, false), 4)).toEqual([36, 52, 40, 64]);
    expect(uvRect(r.geometry('rightLeg', false, false), 4)).toEqual([4, 20, 8, 32]);
    expect(uvRect(r.geometry('leftLeg', false, false), 4)).toEqual([20, 52, 24, 64]);
    expect(uvRect(r.geometry('leftArm', true, true), 4)).toEqual([52, 52, 55, 64]);
    expect(r.geometry('leftArm', false, true).parameters.width).toBe(3);
    expect(r.geometry('leftArm', false, false).parameters.width).toBe(4);
    for (const part of PARTS) for (const outer of [false, true]) for (const slim of [false, true]) {
      const uv = r.geometry(part, outer, slim).getAttribute('uv');
      for (let i = 0; i < uv.count; i++) for (const n of [uv.getX(i), uv.getY(i)]) {
        expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(1);
        expect(n * 512).toBe(n * 64 * 8);
      }
    }
    r.dispose();
  });
});
describe('humanoid articulation, animation and resources', () => {
  it('displays each upgraded appearance once with independent poses and shared scene resources', async () => {
    const loads = loadTextures(), selected = structuredClone(catalog);
    selected.skins.push({ ...structuredClone(selected.skins[0]), id: 'source-reference', provenance: { ...selected.skins[0].provenance, kind: 'source' } });
    const resources = new HumanoidResources(selected), lineup = new HumanoidLineup(resources);
    await lineup.configure({ scale: 1, outer: true, animation: 'walk', wireframe: false, heading: 0, headYaw: 20, headPitch: -10 });
    await lineup.ready(); expect(lineup.loaded).toBe(true);
    expect(lineup.members.map(m => m.loadedSkinId)).toEqual(['skin-64', 'skin-512']);
    const [a, b] = lineup.members;
    expect(a.position.x).toBe(-1.4); expect(b.position.x).toBe(1.4);
    expect(a.layerMeshes.head.base.geometry).toBe(b.layerMeshes.head.base.geometry);
    expect((a.layerMeshes.head.base.material as THREE.MeshStandardMaterial).map).not.toBe((b.layerMeshes.head.base.material as THREE.MeshStandardMaterial).map);
    lineup.update(0); lineup.update(1);
    expect(a.joints.leftArm.rotation.x).not.toBe(b.joints.leftArm.rotation.x);
    expect(a.joints.head.rotation.y).toBeCloseTo(humanoidPose('walk', 1).head[1] + 20 * Math.PI / 180);
    const position = a.position.clone(); lineup.resetPose(); expect(a.position.equals(position)).toBe(true);
    expect(a.joints.leftArm.rotation.x).toBe(0); expect(loads).toHaveBeenCalledTimes(2);
    const geometryDispose = vi.spyOn(a.layerMeshes.head.base.geometry, 'dispose');
    lineup.dispose(); expect(geometryDispose).not.toHaveBeenCalled(); resources.dispose(); expect(geometryDispose).toHaveBeenCalledTimes(1);
  });
  it('keeps limb pivots attached, layers separated and feet/world scale consistent', async () => {
    loadTextures(); const r = new HumanoidResources(catalog), model = new HumanoidModel(r); await model.applyAppearance({ ...appearance, outerLayerVisible: false });
    const bounds = new THREE.Box3().setFromObject(model, true); // Box3 includes invisible meshes; inspect base geometry separately below.
    expect(bounds.max.y).toBeGreaterThan(HUMANOID_HEIGHT);
    const head = new THREE.Box3().setFromObject(model.layerMeshes.head.base), foot = new THREE.Box3().setFromObject(model.layerMeshes.leftLeg.base);
    expect(head.max.y).toBeCloseTo(HUMANOID_HEIGHT); expect(foot.min.y).toBeCloseTo(0);
    const positions = PARTS.map(p => model.joints[p].getWorldPosition(new THREE.Vector3()).clone());
    model.setAnimation('walk'); model.update(0.8); model.updateMatrixWorld(true);
    PARTS.forEach((p, i) => expect(model.joints[p].getWorldPosition(new THREE.Vector3()).distanceTo(positions[i])).toBeLessThan(1e-8));
    for (const part of PARTS) {
      expect(model.layerMeshes[part].outer.visible).toBe(false);
      const inner = model.layerMeshes[part].base.geometry as THREE.BoxGeometry, outer = model.layerMeshes[part].outer.geometry as THREE.BoxGeometry;
      expect(outer.parameters.width).toBeGreaterThan(inner.parameters.width);
      expect(outer.parameters.height).toBeGreaterThan(inner.parameters.height);
    }
    const outer = model.layerMeshes.head.outer.material as THREE.MeshStandardMaterial;
    expect(outer.transparent).toBe(true); expect(outer.alphaTest).toBe(1e-5);
    const leftClothing = model.layerMeshes.leftLeg.outer.material as THREE.MeshStandardMaterial;
    const rightClothing = model.layerMeshes.rightLeg.outer.material as THREE.MeshStandardMaterial;
    expect(leftClothing.polygonOffset).toBe(true); expect(rightClothing.polygonOffsetUnits).toBeGreaterThan(leftClothing.polygonOffsetUnits);
    model.dispose(); r.dispose();
  });
  it('samples elapsed time consistently and transitions without a pose jump', async () => {
    loadTextures(); const r = new HumanoidResources(catalog), a = new HumanoidModel(r), b = new HumanoidModel(r);
    await Promise.all([a.applyAppearance(appearance), b.applyAppearance(appearance)]);
    a.setAnimation('walk'); b.setAnimation('walk'); a.update(1);
    for (let frame = 0; frame <= 120; frame++) b.update(frame / 120);
    expect(a.joints.leftArm.rotation.x).toBeCloseTo(b.joints.leftArm.rotation.x, 10);
    const angle = a.joints.leftArm.rotation.x; a.setAnimation('idle'); a.update(1);
    expect(a.joints.leftArm.rotation.x).toBeCloseTo(angle); a.update(1.2); expect(a.joints.leftArm.rotation.x).toBeCloseTo(0);
    a.setHeadOrientation(0.5, -0.2); a.update(2); expect(a.joints.head.rotation.y).toBeCloseTo(0.5);
    a.resetPose(); expect(a.joints.head.rotation.y).toBe(0); expect(a.joints.leftArm.rotation.x).toBe(0);
    expect(humanoidPose('run', 0.1).leftLeg[0]).not.toBe(humanoidPose('walk', 0.1).leftLeg[0]);
    a.dispose(); b.dispose(); r.dispose();
  });
  it('shares geometry/skins across independent appearances and disposes each owned resource once', async () => {
    const loads = loadTextures(), r = new HumanoidResources(catalog), a = new HumanoidModel(r), b = new HumanoidModel(r);
    await a.applyAppearance(appearance); await b.applyAppearance({ ...appearance, id: 'npc', skinAssetId: 'skin-64', outerLayerVisible: false });
    const hd = (a.layerMeshes.head.base.material as THREE.MeshStandardMaterial).map!, low = (b.layerMeshes.head.base.material as THREE.MeshStandardMaterial).map!;
    const geometry = a.layerMeshes.head.base.geometry; expect(b.layerMeshes.head.base.geometry).toBe(geometry);
    expect(hd).not.toBe(low); expect(a.layerMeshes.head.outer.visible).toBe(true); expect(b.layerMeshes.head.outer.visible).toBe(false);
    for (let i = 0; i < 12; i++) await a.applyAppearance({ ...appearance, skinAssetId: i % 2 ? 'skin-64' : 'skin-512' });
    expect(loads).toHaveBeenCalledTimes(2);
    const hdDispose = vi.spyOn(hd, 'dispose'), lowDispose = vi.spyOn(low, 'dispose'), geoDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(a.layerMeshes.head.base.material as THREE.MeshStandardMaterial, 'dispose');
    a.dispose(); a.dispose(); b.dispose(); expect(materialDispose).toHaveBeenCalledTimes(1); expect(hdDispose).not.toHaveBeenCalled(); r.dispose(); r.dispose();
    expect(hdDispose).toHaveBeenCalledTimes(1); expect(lowDispose).toHaveBeenCalledTimes(1); expect(geoDispose).toHaveBeenCalledTimes(1);
  });
  it('ignores stale asynchronous skin loads after a switch or disposal', async () => {
    const r = new HumanoidResources(catalog), model = new HumanoidModel(r);
    let resolveOld!: (t: THREE.Texture) => void, resolveNew!: (t: THREE.Texture) => void;
    vi.spyOn(r, 'texture').mockImplementation(id => new Promise(resolve => { if (id === 'skin-512') resolveOld = resolve; else resolveNew = resolve; }));
    const old = model.applyAppearance(appearance), next = model.applyAppearance({ ...appearance, skinAssetId: 'skin-64' });
    const newer = new THREE.Texture(); resolveNew(newer); await next; resolveOld(new THREE.Texture()); await old;
    expect((model.layerMeshes.head.base.material as THREE.MeshStandardMaterial).map).toBe(newer);
    expect(model.loadedSkinId).toBe('skin-64');
    const pending = model.applyAppearance(appearance); model.dispose(); resolveOld(new THREE.Texture()); await pending;
    expect((model.layerMeshes.head.base.material as THREE.MeshStandardMaterial).map).toBeNull(); r.dispose();
  });
});
