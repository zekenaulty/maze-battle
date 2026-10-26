import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { validateModelPack, type ModelPack } from '../../assets3d/models/contract';
import { VisualInstance, VisualResources } from '../../assets3d/models/VisualInstance';
import { disposeGeometry, type ThreeAssetLibrary } from '../../assets3d/threeAssets';
import type { AssetRegistry } from '../../assets3d/registry';
import type { SceneBox } from './scene';
import { bookshelfMesh } from './bookshelf';
import { SHELVING, SHELVING_KINDS, SHELVING_PACK_URL, shelfYaw, type ShelvingKind } from './shelving';
type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material };
/** Static closed/default furnishings batch by rendered material, rather than one draw per book. */
export class StageShelving {
  readonly root = new THREE.Group();
  private resources = new VisualResources(SHELVING_PACK_URL);
  private abort = new AbortController();
  private alive = true;
  private pack?: ModelPack;
  private cache = new Map<ShelvingKind, Batch[]>();
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
      if (!this.alive) return; this.pack = pack; this.key = ''; this.sync(this.latest); await this.resources.ready();
      if (this.alive) this.status = this.resources.surfaces.warnings.size ? 'fallback' : 'ready';
    }).catch(() => { if (this.alive) { this.pack = undefined; this.key = ''; this.sync(this.latest); this.status = 'fallback'; warning('Shelving models unavailable; showing simple bookcases.'); } });
  }
  private baked(kind: ShelvingKind): Batch[] {
    const old = this.cache.get(kind); if (old) return old;
    const pack = this.pack!, asset = pack.assets[SHELVING[kind].assetId], instance = new VisualInstance(asset, this.resources);
    const definitions = Object.fromEntries(Object.entries(pack.bindings[asset.id]).map(([slot, id]) => [slot, pack.materials[id]]));
    instance.bindMaterials(definitions); instance.setVisualState(asset.states.closed ? 'closed' : 'default'); instance.root.updateMatrixWorld(true);
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
    this.cache.set(kind, result); return result;
  }
  sync(boxes: SceneBox[]) {
    this.latest = boxes.filter(b => b.material === 'bookshelf');
    const key = JSON.stringify(this.latest); if (!this.alive || key === this.key) return; this.key = key;
    disposeGeometry(this.root); this.root.clear();
    if (!this.pack) { for (const box of this.latest) this.root.add(bookshelfMesh(box, this.registry, this.library)); return; }
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const box of this.latest) {
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), shelfYaw[box.facing ?? 'south']);
      const transform = new THREE.Matrix4().compose(new THREE.Vector3(box.center[0], box.center[1] - box.size[1] / 2, box.center[2]), rotation, new THREE.Vector3(1, 1, 1));
      for (const { geometry, material } of this.baked(box.furnishing ?? 'low-bookcase')) {
        const parts = batches.get(material) ?? []; parts.push(geometry.clone().applyMatrix4(transform)); batches.set(material, parts);
      }
    }
    for (const [material, parts] of batches) {
      const geometry = mergeGeometries(parts, false); for (const part of parts) part.dispose(); if (geometry) this.root.add(new THREE.Mesh(geometry, material));
    }
  }
  dispose() { this.alive = false; this.abort.abort(); disposeGeometry(this.root); this.root.clear();
    for (const batches of this.cache.values()) for (const batch of batches) batch.geometry.dispose(); this.cache.clear(); this.resources.dispose(); this.materials.clear(); }
}
