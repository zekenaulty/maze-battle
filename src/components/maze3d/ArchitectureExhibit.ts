import * as THREE from 'three';
import { AnimationClock } from '../../assets3d/animation';
import { modelAnimationSample } from '../../assets3d/models/AnimatedMaterials';
import { LIGHTING_PACK_URL, validateModelPack, type VisualAsset, type ModelAnimation, type ModelPack } from '../../assets3d/models/contract';
import { VisualInstance, VisualResources } from '../../assets3d/models/VisualInstance';

export interface ArchitectureOptions { wireframe: boolean; markers: boolean; playing: boolean }
/** Inspection-only assembly. No game session, world reader, collision writer or second renderer. */
export class ArchitectureExhibit {
  readonly root = new THREE.Group();
  readonly light = new THREE.PointLight('#ffc36b', 38, 10, 1.7);
  readonly clock = new AnimationClock();
  private resources = new VisualResources(LIGHTING_PACK_URL);
  private instances: VisualInstance[] = [];
  private overlays: THREE.Group[] = [];
  private owned = new THREE.Group();
  private animation?: ModelAnimation;
  private load?: Promise<void>;
  private alive = true;
  private ready = false;
  status = 'Loading architecture preview…';
  private options: ArchitectureOptions = { wireframe: false, markers: false, playing: true };
  private assets = new Map<string, { asset: VisualAsset; model: VisualInstance }>();
  constructor(privateCanvas: HTMLCanvasElement) {
    this.canvas = privateCanvas; this.root.name = 'architecture-preview'; this.root.add(this.light, this.owned);
    this.light.position.set(2.4, 4.4, .1);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(11.5, .12, 5), new THREE.MeshStandardMaterial({ color: '#4f5153', roughness: .9 }));
    floor.position.y = -.07; this.owned.add(floor);
    const reference = new THREE.Mesh(new THREE.BoxGeometry(.35, 2.7, .35), new THREE.MeshStandardMaterial({ color: '#a5b7a8' }));
    reference.position.set(0, 1.35, 0); this.owned.add(reference);
  }
  private canvas: HTMLCanvasElement;
  async ensureLoaded(signal: AbortSignal, changed: (message: string) => void) {
    if (this.load) return this.load;
    this.load = (async () => {
      try {
        const response = await fetch(LIGHTING_PACK_URL, { signal, cache: 'no-cache' }); if (!response.ok) throw Error('Architecture preview pack unavailable; run assets:import-workshop.');
        const pack: ModelPack = await response.json(); validateModelPack(pack); if (!this.alive) return;
        for (const [id, x] of [['doorway-surround-arched', -2.4], ['hanging-lantern-fixture', 2.4]] as const) {
          const asset = pack.assets[id]; if (!asset?.placement) throw Error(`Missing architecture placement: ${id}`);
          const model = new VisualInstance(asset, this.resources); model.bindMaterials(Object.fromEntries(
            Object.entries(pack.bindings[id]).map(([slot, material]) => [slot, pack.materials[material]])));
          model.setVisualState('neutral'); model.root.position.x = x; model.root.scale.setScalar(1.5); this.root.add(model.root);
          this.instances.push(model); this.assets.set(id, { asset, model });
          const overlay = new THREE.Group(); model.root.add(overlay); this.overlays.push(overlay);
          const box = (bounds: { min: number[]; max: number[] }, color: string) => {
            const b = new THREE.Box3(new THREE.Vector3(...bounds.min as [number, number, number]), new THREE.Vector3(...bounds.max as [number, number, number]));
            overlay.add(new THREE.Box3Helper(b, color));
          };
          box(asset.placement.bounds, '#49b9dc'); for (const clearance of asset.placement.clearances) box(clearance, '#78e687');
          for (const anchor of model.anchors.values()) { const axes = new THREE.AxesHelper(.22); axes.position.copy(anchor.position); axes.quaternion.copy(anchor.quaternion); overlay.add(axes); }
        }
        this.animation = Object.values(pack.materials).find(m => m.animation)?.animation;
        await this.resources.ready(); if (!this.alive) return;
        if (this.resources.animated.warnings.size || this.resources.surfaces.warnings.size) throw Error('Architecture textures unavailable.');
        this.clock.seek(0); this.ready = true; this.canvas.dataset.architectureReady = 'true'; this.canvas.dataset.architectureRevision = pack.revision;
        this.canvas.dataset.architectureMeshes = String([...this.assets.values()].reduce((n, a) => n + a.asset.payload.geometries.candidate.length, 0));
        this.update(this.options);
        this.status = 'Preview: authored archway + mounted original lantern · placeholder stone/iron colors · no game admission'; changed(this.status);
      } catch (error) { if (this.alive && !signal.aborted) { this.canvas.dataset.architectureReady = 'false'; this.status = String(error); changed(this.status); } }
    })(); return this.load;
  }
  update(options: ArchitectureOptions) {
    this.options = options; this.clock.playing = options.playing;
    for (const instance of this.instances) instance.setWireframe(options.wireframe);
    for (const overlay of this.overlays) overlay.visible = options.markers;
  }
  step() {
    if (!this.animation) return;
    this.clock.playing = false;
    const sample = modelAnimationSample(this.animation, this.clock.elapsedMs), next = (sample.step + 1) % this.animation.timeline.length;
    this.clock.seek(this.animation.timeline.slice(0, next).reduce((n, s) => n + s.durationMs, 0));
  }
  tick(timestamp: number) {
    const elapsed = this.clock.advance(timestamp); this.resources.tick(elapsed);
    if (this.animation && this.ready) {
      const sample = modelAnimationSample(this.animation, elapsed);
      this.canvas.dataset.lanternStep = String(sample.step); this.canvas.dataset.lanternFrame = String(sample.frame);
      this.canvas.dataset.lanternBlend = sample.blend.toFixed(4); this.canvas.dataset.lanternElapsed = elapsed.toFixed(2);
      this.canvas.dataset.lanternTextures = String(this.resources.animated.textureCount);
      this.canvas.dataset.architectureGeometryCount = String(this.resources.geometryCount);
      this.canvas.dataset.architectureAnimatedMaterials = String(this.resources.animated.materialCount);
    }
  }
  bounds(lantern = false) {
    const box = new THREE.Box3();
    for (const [id, { asset, model }] of this.assets) {
      if (lantern && id !== 'hanging-lantern-fixture') continue;
      model.root.updateMatrixWorld(true); const b = asset.placement!.bounds;
      box.union(new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)).applyMatrix4(model.root.matrixWorld));
    }
    return box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-5, 0, -1), new THREE.Vector3(5, 5.6, 1)) : box;
  }
  dispose() {
    this.alive = false;
    for (const overlay of this.overlays) overlay.traverse(node => { if (node instanceof THREE.LineSegments) { node.geometry.dispose(); (node.material as THREE.Material).dispose(); } });
    for (const instance of this.instances) instance.dispose();
    this.owned.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (node.material as THREE.Material).dispose(); } });
    this.resources.dispose(); this.root.removeFromParent(); this.light.dispose(); this.assets.clear();
  }
}
