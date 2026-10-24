// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createChestModel, CHEST_STATES } from './chestModel';
import type { ModelDefinition } from './manifest';
import { AssetRegistry } from './registry';
import { applyBlockAppearance, blockGeometry, disposeGeometry, ThreeAssetLibrary } from './threeAssets';
const recipe = JSON.parse(readFileSync(new URL('../../scripts/asset-selections/dungeon-occult-01-chest.json', import.meta.url), 'utf8')).blocks[0];

function chest() {
  const library = new ThreeAssetLibrary();
  const resolved = { ...new AssetRegistry().resolve('chest'), model: recipe.model as ModelDefinition, poses: CHEST_STATES.closed.poses! };
  const group = blockGeometry(resolved, library);
  return { library, resolved, group, dispose() { disposeGeometry(group); library.dispose(); } };
}
const mesh = (group: THREE.Group, name: string) => group.getObjectByName(name)!.children[0] as THREE.Mesh<THREE.BoxGeometry>;

describe('multipart chest geometry', () => {
  it('gives each frame surface one owner, including the rim where the lid rests', () => {
    const c = chest(); c.group.updateMatrixWorld(true);
    const quads: Array<{ name: string; axis: number; plane: number; bounds: THREE.Box3 }> = [];
    c.group.traverse(part => {
      if (!(part instanceof THREE.Mesh) || !/^(body|interior|rim_.*)$/.test(part.parent!.name)) return;
      const geometry = part.geometry as THREE.BoxGeometry;
      for (const face of geometry.groups) {
        const bounds = new THREE.Box3();
        for (let i = face.start; i < face.start + face.count; i++) {
          bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, geometry.index!.getX(i)).applyMatrix4(part.matrixWorld));
        }
        const extent = bounds.getSize(new THREE.Vector3()).toArray();
        const axis = extent.findIndex(n => n < 1e-7);
        quads.push({ name: part.parent!.name, axis, plane: bounds.min.getComponent(axis), bounds });
      }
    });
    // This comparison catches the former rim side faces exactly coinciding with both walls.
    for (let i = 0; i < quads.length; i++) for (const b of quads.slice(i + 1)) {
      const a = quads[i]; if (a.axis !== b.axis || Math.abs(a.plane - b.plane) > 1e-7) continue;
      const overlap = [0, 1, 2].filter(n => n !== a.axis).every(n =>
        Math.min(a.bounds.max.getComponent(n), b.bounds.max.getComponent(n)) - Math.max(a.bounds.min.getComponent(n), b.bounds.min.getComponent(n)) > 1e-7);
      expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false);
    }
    expect(quads.filter(q => q.name.startsWith('rim_'))).toHaveLength(4);
    expect(quads.filter(q => q.name.startsWith('rim_')).every(q => q.axis === 1 && Math.abs(q.plane - 10 / 16) < 1e-7)).toBe(true);
    c.dispose();
  });

  it('moves the lid and lock together about the rear hinge without rebuilding the body', () => {
    const c = chest(); c.group.updateMatrixWorld(true);
    const lid = c.group.getObjectByName('lid')!, lock = c.group.getObjectByName('lock')!;
    const originalBody = mesh(c.group, 'body').matrixWorld.clone();
    const originalLock = lock.getWorldPosition(new THREE.Vector3());
    const geometries = c.group.children.map(joint => (joint.children[0] as THREE.Mesh).geometry);
    const hinge = lid.getWorldPosition(new THREE.Vector3());
    expect(lock.parent).toBe(lid);
    applyBlockAppearance(c.group, { ...c.resolved, poses: CHEST_STATES.open.poses! }, c.library);
    c.group.updateMatrixWorld(true);
    expect(lid.getWorldPosition(new THREE.Vector3()).distanceTo(hinge)).toBeLessThan(1e-9);
    expect(mesh(c.group, 'body').matrixWorld.equals(originalBody)).toBe(true);
    expect(lock.getWorldPosition(new THREE.Vector3()).distanceTo(originalLock)).toBeGreaterThan(0.5);
    expect(c.group.children.map(joint => (joint.children[0] as THREE.Mesh).geometry)).toEqual(geometries);
    applyBlockAppearance(c.group, c.resolved, c.library); c.group.updateMatrixWorld(true);
    expect(lock.getWorldPosition(new THREE.Vector3()).distanceTo(originalLock)).toBeLessThan(1e-9);
    // The closed lid underside clears the rim instead of sharing its plane.
    expect(new THREE.Box3().setFromObject(mesh(c.group, 'lid')).min.y).toBeGreaterThan(10 / 16);
    c.dispose();
  });

  it('keeps rendered UVs inside their atlas islands with a texel inset', () => {
    expect(recipe.model).toEqual(createChestModel());
    expect(recipe.states).toEqual(CHEST_STATES);
    const c = chest();
    c.group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const uv = child.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) for (const n of [uv.getX(i), uv.getY(i)]) {
        expect(Number.isFinite(n)).toBe(true); expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(1);
      }
    });
    c.dispose();
  });
});
