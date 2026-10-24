import * as THREE from 'three';
import { FACE_ORDER } from '../manifest';
import type { BlockFace } from '../manifest';
import { ThreeAssetLibrary } from '../threeAssets';
import type { CuboidPart, VisualAsset, VisualMaterial } from './contract';
import { validateVisualAsset } from './contract';

export function cuboidGeometry(part: CuboidPart) {
  const geometry = new THREE.BoxGeometry(...part.size!);
  const uv = geometry.getAttribute('uv'), groups = [...geometry.groups]; geometry.clearGroups();
  FACE_ORDER.forEach((name, index) => {
    const face = part.faces?.[name]; if (!face) return;
    const [u0, v0, u1, v1] = face.rect;
    for (let corner = 0; corner < 4; corner++) {
      const i = index * 4 + corner; let u = uv.getX(i), v = uv.getY(i);
      for (let turn = 0; turn < (face.rotation ?? 0) / 90; turn++) [u, v] = [1 - v, u];
      uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
    }
    geometry.addGroup(groups[index].start, groups[index].count, index);
  });
  return geometry;
}

/** Shared immutable GPU data; instances own only transforms and state. */
export class VisualResources {
  readonly surfaces: ThreeAssetLibrary;
  private geometries = new Map<string, THREE.BufferGeometry>();
  private solids = new Map<string, THREE.MeshStandardMaterial>();
  private disposed = false;
  constructor(baseUrl: string, changed = () => {}) { this.surfaces = new ThreeAssetLibrary(changed, baseUrl); }
  geometry(asset: VisualAsset, stateGeometry: string, part: CuboidPart) {
    if (this.disposed) throw new Error('Visual resources disposed');
    const key = `${asset.id}/${asset.geometryRevision}/${stateGeometry}/${part.id}`;
    let geometry = this.geometries.get(key);
    if (!geometry) { geometry = cuboidGeometry(part); this.geometries.set(key, geometry); }
    return geometry;
  }
  get geometryCount() { return this.geometries.size; }
  material(face: BlockFace, definition?: VisualMaterial) {
    if (this.disposed) throw new Error('Visual resources disposed');
    if (definition?.texture) return this.surfaces.material({ face, material: { ...definition, texture: definition.texture }, fallbackColor: definition.fallbackColor });
    const key = JSON.stringify(definition ?? null); let material = this.solids.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: definition?.fallbackColor ?? '#8e9b9c', roughness: definition?.roughness ?? 1,
        side: definition?.render?.side === 'double' ? THREE.DoubleSide : THREE.FrontSide });
      this.solids.set(key, material);
    }
    return material;
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.surfaces.dispose(); for (const g of this.geometries.values()) g.dispose();
    for (const m of this.solids.values()) m.dispose(); this.geometries.clear(); this.solids.clear(); }
}

export class VisualInstance {
  readonly root = new THREE.Group();
  readonly anchors = new Map<string, THREE.Object3D>();
  private asset: VisualAsset;
  private resources: VisualResources;
  private groups = new Map<string, THREE.Group>();
  private bindings: Record<string, VisualMaterial> = {};
  private state = '';
  private wireframe = false;
  private disposed = false;
  constructor(asset: VisualAsset, resources: VisualResources) {
    validateVisualAsset(asset); this.asset = asset; this.resources = resources; this.root.name = asset.id;
    for (const [name, anchor] of Object.entries(asset.anchors ?? {})) {
      const point = new THREE.Object3D(); point.name = name; point.position.set(...anchor.position);
      if (anchor.rotation) point.rotation.set(...anchor.rotation); this.root.add(point); this.anchors.set(name, point);
    }
  }
  get supportedStates() { return Object.keys(this.asset.states); }
  get currentState() { return this.state; }
  get geometryRevision() { return this.asset.geometryRevision; }
  bindMaterials(bindings: Record<string, VisualMaterial>) {
    if (this.disposed) throw new Error('Visual instance disposed');
    for (const [id, slot] of Object.entries(this.asset.slots)) {
      if (!bindings[id] || bindings[id].layoutId !== slot.layoutId) throw new Error(`Incompatible material layout for ${this.asset.id}/${id}`);
    }
    this.clearDebugMaterials(); this.bindings = { ...bindings }; this.applyMaterials();
  }
  private applyMaterials() {
    for (const group of this.groups.values()) group.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const part: CuboidPart = node.userData.visualPart;
      node.material = FACE_ORDER.map(face => {
        const binding = part.faces?.[face], material = binding && this.bindings[binding.slot];
        const result = this.resources.material(face, material);
        // Wireframe is instance-local; never mutate a shared material.
        return this.wireframe ? this.wireMaterial(result) : result;
      });
    });
  }
  private debugMaterials = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  private wireMaterial(original: THREE.MeshStandardMaterial) {
    let material = this.debugMaterials.get(original);
    if (!material) { material = original.clone(); material.wireframe = true; this.debugMaterials.set(original, material); }
    return material;
  }
  private clearDebugMaterials() { for (const material of this.debugMaterials.values()) material.dispose(); this.debugMaterials.clear(); }
  setWireframe(enabled: boolean) { if (this.wireframe === enabled) return; this.clearDebugMaterials(); this.wireframe = enabled; this.applyMaterials(); }
  setVisualState(name: string) {
    if (this.disposed) throw new Error('Visual instance disposed');
    const state = this.asset.states[name]; if (!state) throw new Error(`Unsupported visual state ${this.asset.id}/${name}`);
    let group = this.groups.get(state.geometry);
    if (!group) {
      group = new THREE.Group(); group.name = state.geometry;
      const joints = new Map<string, THREE.Group>(), parts = this.asset.payload.geometries[state.geometry];
      for (const part of parts) {
        const joint = new THREE.Group(); joint.name = part.id; joint.position.set(...(part.pivot ?? part.position));
        joint.userData.bindRotation = part.rotation ?? [0, 0, 0];
        if (part.scale) joint.scale.set(...part.scale);
        if (part.size) {
          const mesh = new THREE.Mesh(this.resources.geometry(this.asset, state.geometry, part), []);
          const pivot = part.pivot ?? part.position;
          mesh.position.set(part.position[0] - pivot[0], part.position[1] - pivot[1], part.position[2] - pivot[2]);
          mesh.userData.visualPart = part; joint.add(mesh);
        }
        joints.set(part.id, joint);
      }
      for (const part of parts) (part.parent ? joints.get(part.parent)! : group).add(joints.get(part.id)!);
      this.groups.set(state.geometry, group); this.root.add(group); this.applyMaterials();
    }
    for (const [key, value] of this.groups) value.visible = key === state.geometry;
    group.traverse(node => {
      if (!node.userData.bindRotation) return;
      node.rotation.set(...node.userData.bindRotation as [number, number, number]);
      const pose = state.poses?.[node.name];
      if (pose) node.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose)));
    });
    this.state = name;
  }
  update(_elapsedSeconds: number) { /* Baked/explicit poses have no private frame-count clock. */ }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.root.removeFromParent(); this.root.clear(); this.groups.clear();
    this.clearDebugMaterials(); this.anchors.clear();
  }
}
