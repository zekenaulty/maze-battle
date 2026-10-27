import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { validateModelPack, type ModelPack } from '../../assets3d/models/contract';
import { VisualInstance, VisualResources } from '../../assets3d/models/VisualInstance';
import { disposeGeometry, type ThreeAssetLibrary } from '../../assets3d/threeAssets';
import type { AssetRegistry } from '../../assets3d/registry';
import type { Point, SceneBox } from './scene';
import { bookshelfMesh } from './bookshelf';
import { SHELVING, SHELVING_KINDS, SHELVING_PACK_URL, shelfYaw, type ShelvingKind } from './shelving';
import { cabinetClearance, cabinetVisible } from './cabinetInteraction';
type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material };
/** Static closed/default furnishings batch by rendered material, rather than one draw per book. */
export class StageShelving {
  readonly root = new THREE.Group();
  private resources = new VisualResources(SHELVING_PACK_URL);
  private abort = new AbortController();
  private alive = true;
  private pack?: ModelPack;
  private cache = new Map<string, Batch[]>();
  private open = new Map<string, boolean>();
  private obstacles: SceneBox[] = [];
  private materials = new Map<string, THREE.Material>();
  private latest: SceneBox[] = [];
  private key = '';
  status = 'loading';
  readonly ready: Promise<void>;
  private registry: AssetRegistry;
  private library: ThreeAssetLibrary;
  constructor(registry: AssetRegistry, library: ThreeAssetLibrary, warning: (message: string) => void) {
    this.registry = registry; this.library = library;
    this.root.name = 'tilelab-shelving';
    this.ready = fetch(SHELVING_PACK_URL, { signal: this.abort.signal, cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw Error('Shelving pack unavailable'); const pack: ModelPack = await response.json(); validateModelPack(pack);
      for (const kind of SHELVING_KINDS) if (!pack.assets[SHELVING[kind].assetId]) throw Error('Selected shelving asset missing');
      if (!this.alive) return; this.pack = pack; this.key = ''; this.sync(this.obstacles); await this.resources.ready();
      if (this.alive) this.status = this.resources.surfaces.warnings.size ? 'fallback' : 'ready';
    }).catch(() => { if (this.alive) { this.pack = undefined; this.key = ''; this.sync(this.obstacles); this.status = 'fallback'; warning('Shelving models unavailable; showing simple bookcases.'); } });
  }
  private baked(kind: ShelvingKind, state: string): Batch[] {
    const cacheKey = kind + '/' + state, old = this.cache.get(cacheKey); if (old) return old;
    const pack = this.pack!, asset = pack.assets[SHELVING[kind].assetId], instance = new VisualInstance(asset, this.resources);
    const definitions = Object.fromEntries(Object.entries(pack.bindings[asset.id]).map(([slot, id]) => [slot, pack.materials[id]]));
    instance.bindMaterials(definitions); instance.setVisualState(state); instance.root.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    instance.root.traverse(node => {
      if (!(node instanceof THREE.Mesh) || !node.visible) return;
      const definition = definitions[node.userData.visualPart.mesh.slot];
      const key = JSON.stringify([definition.texture?.sha256, definition.surface, definition.render, definition.fallbackColor, definition.roughness]);
      let material = this.materials.get(key); if (!material) { material = (node.material as THREE.Material[])[0]; this.materials.set(key, material); }
      const parts = batches.get(material) ?? []; parts.push(node.geometry.clone().applyMatrix4(node.matrixWorld)); batches.set(material, parts);
    });
    instance.dispose(); const result: Batch[] = [];
    for (const [material, parts] of batches) {
      const geometry = mergeGeometries(parts, false); for (const part of parts) part.dispose(); if (geometry) result.push({ geometry, material });
    }
    this.cache.set(cacheKey, result); return result;
  }
  sync(boxes: SceneBox[]) {
    this.obstacles = boxes;
    this.latest = boxes.filter(b => b.material === 'bookshelf');
    for (const id of this.open.keys()) if (!this.latest.some(b => b.id === id)) this.open.delete(id);
    const key = JSON.stringify([this.latest, [...this.open]]); if (!this.alive || key === this.key) return; this.key = key;
    disposeGeometry(this.root); this.root.clear();
    if (!this.pack) { for (const box of this.latest) this.root.add(bookshelfMesh(box, this.registry, this.library)); return; }
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const box of this.latest) {
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), shelfYaw[box.facing ?? 'south']);
      const transform = new THREE.Matrix4().compose(new THREE.Vector3(box.center[0], box.center[1] - box.size[1] / 2, box.center[2]), rotation, new THREE.Vector3(1, 1, 1));
      const kind = box.furnishing ?? 'low-bookcase', state = kind === 'cabinet' ? this.open.get(box.id) ? 'open' : 'closed' : 'default';
      for (const { geometry, material } of this.baked(kind, state)) {
        const parts = batches.get(material) ?? []; parts.push(geometry.clone().applyMatrix4(transform)); batches.set(material, parts);
      }
    }
    for (const [material, parts] of batches) {
      const geometry = mergeGeometries(parts, false); for (const part of parts) part.dispose(); if (geometry) this.root.add(new THREE.Mesh(geometry, material));
    }
  }
  private nearest(position: Point, footY: number) {
    if (!this.pack) return;
    let result: { box: SceneBox; distance: number } | undefined;
    for (const box of this.latest.filter(b => b.furnishing === 'cabinet')) {
      if (Math.abs(box.center[1] - box.size[1] / 2 - footY) > .35) continue;
      const yaw = shelfYaw[box.facing ?? 'south'], nx = Math.sin(yaw), nz = Math.cos(yaw);
      if ((position.x - box.center[0]) * nx + (position.z - box.center[2]) * nz < 0) continue;
      const at = { x: box.center[0] + nx * .34, z: box.center[2] + nz * .34 }, distance = Math.hypot(position.x - at.x, position.z - at.z);
      if (distance > 2.5 || !cabinetVisible(position, at, footY, this.obstacles, box.id)) continue;
      if (!result || distance < result.distance) result = { box, distance };
    }
    return result;
  }
  interactionDistance(position: Point, footY: number) { return this.nearest(position, footY)?.distance ?? Infinity; }
  aimed(position: Point, footY: number, yaw: number) {
    const target = this.nearest(position, footY); if (!target) return false;
    const dx = target.box.center[0] - position.x, dz = target.box.center[2] - position.z;
    return (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / Math.hypot(dx, dz) > .85;
  }
  get states() { return this.latest.filter(b => b.furnishing === 'cabinet').map(b => ({ id: b.id, open: !!this.open.get(b.id) })); }
  interact(position: Point, footY: number) {
    const target = this.nearest(position, footY); if (!target) return;
    const blocked = cabinetClearance(target.box, this.obstacles, position, footY); if (blocked) return blocked;
    const value = !this.open.get(target.box.id); this.open.set(target.box.id, value); this.sync(this.obstacles);
    return 'Cabinet ' + (value ? 'opened' : 'closed');
  }
  dispose() { this.alive = false; this.abort.abort(); disposeGeometry(this.root); this.root.clear();
    for (const batches of this.cache.values()) for (const batch of batches) batch.geometry.dispose(); this.cache.clear(); this.resources.dispose(); this.materials.clear(); }
}
