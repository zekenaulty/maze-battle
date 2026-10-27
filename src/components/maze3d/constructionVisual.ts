import * as THREE from 'three';
import { loadAssetRegistry, type AssetRegistry } from '../../assets3d/registry';
import { ThreeAssetLibrary } from '../../assets3d/threeAssets';
import { validateModelPack, type ModelPack } from '../../assets3d/models/contract';
import { VisualInstance, VisualResources } from '../../assets3d/models/VisualInstance';
import type { ConstructionFragment, ConstructionMember, ConstructionPlan } from '../../domain/construction/types';
import { validateConstructionPlan } from '../../domain/construction/roomPlan';
import { masonryUV } from './construction';
import { timberGeometry } from './timber';
import { TIMBER_PACK_URL } from './StageTimbers';
import { SHELVING_PACK_URL } from './shelving';

export function constructionBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(root, true);
  return { min: box.min.toArray(), max: box.max.toArray() };
}

/** Complete authoring assembly adapter. It is independent of canonical game observation. */
export class ConstructionResources {
  readonly masonry = new ThreeAssetLibrary();
  readonly timber = new VisualResources(TIMBER_PACK_URL);
  readonly shelving = new VisualResources(SHELVING_PACK_URL);
  readonly registry: AssetRegistry;
  readonly timberPack: ModelPack;
  readonly shelvingPack: ModelPack;
  private constructor(registry: AssetRegistry, timberPack: ModelPack, shelvingPack: ModelPack) {
    this.registry = registry; this.timberPack = timberPack; this.shelvingPack = shelvingPack;
  }
  static async load(signal: AbortSignal) {
    const pack = async (url: string) => {
      const response = await fetch(url, { signal, cache: 'no-cache' }); if (!response.ok) throw Error('Selected construction package unavailable');
      const result: ModelPack = await response.json(); validateModelPack(result); return result;
    };
    const [registry, timber, shelving] = await Promise.all([loadAssetRegistry(signal), pack(TIMBER_PACK_URL), pack(SHELVING_PACK_URL)]);
    return new ConstructionResources(registry, timber, shelving);
  }
  wood(role: 'bark' | 'wood-planks' | 'wood-endgrain') {
    const material = Object.values(this.timberPack.materials).find(m => m.label === role);
    if (!material?.texture) throw Error('Selected timber material is missing');
    return this.timber.material('front', material);
  }
  async ready() {
    await Promise.all([this.masonry.ready(), this.timber.ready(), this.shelving.ready()]);
    if (this.masonry.warnings.size || this.timber.surfaces.warnings.size || this.shelving.surfaces.warnings.size)
      throw Error('Construction textures are missing; portable export is unavailable');
  }
  dispose() { this.masonry.dispose(); this.timber.dispose(); this.shelving.dispose(); }
}

export function constructionTimberGeometry(member: ConstructionMember, fragment?: ConstructionFragment) {
  const role = member.role === 'joist' ? 'joist' : member.role === 'rafter' ? 'rafter' : 'trim';
  return timberGeometry({ ...(fragment ?? member), role, axis: member.axis, origin: member.uvOrigin },
    fragment ? { start: fragment.capStart, end: fragment.capEnd } : undefined);
}
export class ConstructionVisual {
  readonly root = new THREE.Group();
  private geometries: THREE.BufferGeometry[] = [];
  private instances: VisualInstance[] = [];
  readonly plan: ConstructionPlan;
  constructor(plan: ConstructionPlan, resources: ConstructionResources) {
    this.plan = plan;
    validateConstructionPlan(plan);
    this.root.name = plan.id; this.root.userData = { constructionPlan: plan.version, profile: plan.profile,
      recipe: plan.brief, frame: plan.frame, anchors: plan.anchors };
    const add = (id: string, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], userData: object) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = id; mesh.userData = userData;
      this.geometries.push(geometry); this.root.add(mesh);
    };
    for (const m of plan.members) {
      const data = { memberId: m.id, role: m.role, bearings: m.bearings ?? [], uvOrigin: m.uvOrigin };
      if (m.material === 'timber') {
        const g = constructionTimberGeometry(m);
        add(m.id + '/sides', g.sides, resources.wood(m.role === 'joist' ? 'bark' : 'wood-planks'), data);
        add(m.id + '/ends', g.ends, resources.wood('wood-endgrain'), data);
      } else {
        const size = m.max.map((v, i) => v - m.min[i]) as [number, number, number];
        const center = m.max.map((v, i) => (v + m.min[i]) / 2) as [number, number, number];
        const geometry = new THREE.BoxGeometry(...size); geometry.translate(...center);
        const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
        for (let i = 0; i < positions.count; i++) uv.setXY(i, ...masonryUV([positions.getX(i), positions.getY(i), positions.getZ(i)],
          [normals.getX(i), normals.getY(i), normals.getZ(i)], m.uvOrigin));
        const block = resources.registry.resolve(m.material === 'floor' ? 'cobblestone' : 'stone_bricks');
        if (block.warnings.length) throw Error('Selected masonry binding is missing');
        add(m.id, geometry, block.faces.map(f => resources.masonry.material(f)), data);
      }
    }
    for (const f of plan.furnishings) {
      const asset = resources.shelvingPack.assets[f.assetId]; if (!asset) throw Error('Selected shelving asset missing');
      const instance = new VisualInstance(asset, resources.shelving);
      instance.bindMaterials(Object.fromEntries(Object.entries(resources.shelvingPack.bindings[asset.id])
        .map(([slot, id]) => [slot, resources.shelvingPack.materials[id]])));
      instance.setVisualState(Object.keys(asset.states)[0]);
      instance.root.name = f.id; instance.root.userData = { assetId: f.assetId, anchorId: f.anchorId, staticState: Object.keys(asset.states)[0] };
      instance.root.position.set(...f.position); instance.root.rotation.y = f.yaw;
      this.root.add(instance.root); this.instances.push(instance);
    }
  }
  cutaway(active: boolean) {
    for (const child of this.root.children) child.visible = !active || child.userData.role !== 'ceiling' && !child.name.includes('/wall/1/');
  }
  dispose() { this.geometries.forEach(g => g.dispose()); this.instances.forEach(i => i.dispose()); this.root.removeFromParent(); this.root.clear(); }
}
