import * as THREE from 'three';
import type { GameView } from '../../services/game/GameView';
import { AssetRegistry } from '../../assets3d/registry';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ThreeAssetLibrary, blockGeometry, applyBlockAppearance, disposeGeometry } from '../../assets3d/threeAssets';
import { HumanoidResources } from '../../assets3d/humanoid/HumanoidResources';
import { HumanoidModel } from '../../assets3d/humanoid/HumanoidModel';
import type { SkinCatalog } from '../../assets3d/humanoid/contract';
import { compileStageScene } from './scene';
import type { SceneBox, StageScene } from './scene';
import { StageWalker } from './movement';
import { CELL_SIZE, EYE_HEIGHT } from './constants';
import { bookshelfMesh } from './bookshelf';
import { stageBoxGeometry } from './surfaces';
import { StageInteractables } from './StageInteractables';
import { masonrySurfaces } from './masonry';

export class StageRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly walker: StageWalker;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.08, 60);
  private scene = new THREE.Scene();
  private library = new ThreeAssetLibrary();
  private unknown = new THREE.MeshBasicMaterial({ color: '#10151d' });
  private boxes = new Map<string, { description: string; object: THREE.Object3D }>();
  private chestStates = new Map<string, THREE.Group>();
  private light = new THREE.PointLight('#ffe5be', 55, 25, 1.6);
  private observer: ResizeObserver;
  private alive = true;
  private graphicsLost = false;
  private snapshotKey = '';
  private skinResources?: HumanoidResources;
  private player?: HumanoidModel;
  private thirdPerson = false;
  private registry: AssetRegistry;
  private failure: (message: string) => void;
  private materialWarning: (message: string) => void;
  private stairs = new Map<string, THREE.PointLight[]>();
  private masonry = new THREE.Group();
  private masonryKey = '';
  private masonryMaterials = new Map<string, THREE.Material>();
  private interactables: StageInteractables;
  yaw = 0; pitch = 0;
  constructor(container: HTMLElement, registry: AssetRegistry, game: GameView, failure: (message: string) => void, materialWarning = (_message: string) => {}) {
    this.registry = registry; this.failure = failure; this.materialWarning = materialWarning;
    const initial = compileStageScene(game);
    if (!initial) throw new Error('Observe the current position before entering 3D.');
    this.walker = new StageWalker(initial);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement; this.canvas.tabIndex = 0; this.canvas.className = 'canonical-3d-canvas';
    this.canvas.setAttribute('aria-label', 'Explorable 3D dungeon'); container.append(this.canvas);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    // Blend into the background before the bounded disclosed floor ends.
    this.scene.background = new THREE.Color('#10151d'); this.scene.fog = new THREE.Fog('#10151d', CELL_SIZE, CELL_SIZE * 3.5);
    this.scene.add(new THREE.HemisphereLight('#c5d5f1', '#4c3e30', 1.55), this.light);
    this.scene.add(this.masonry);
    this.interactables = new StageInteractables(this.scene, materialWarning);
    this.observer = new ResizeObserver(() => {
      if (!this.alive) return;
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.render(0, false);
    }); this.observer.observe(container);
    this.yaw = ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 })[game.checkpoint.facing];
    this.update(game);
  }
  private contextLost = (event: Event) => { event.preventDefault(); this.graphicsLost = true; this.failure('Graphics context lost. Restart 3D or return to 2D.'); };
  update(game: GameView) {
    const key = JSON.stringify(game.snapshot);
    if (!this.alive || key === this.snapshotKey) return;
    const next = compileStageScene(game, this.walker.scene.origin, this.walker.scene.originFrame);
    if (!next || !this.alive) return;
    this.snapshotKey = key;
    this.walker.update(next); this.syncScene(next);
    this.canvas.dataset.actor = next.actor.key; this.canvas.dataset.world = `${next.actor.source.world.row},${next.actor.source.world.column}`;
    this.canvas.dataset.center = `${next.actor.center.x},${next.actor.center.z}`;
    this.canvas.dataset.revision = String(game.snapshot.revision); this.canvas.dataset.cells = String(next.cells.length);
    this.canvas.dataset.textures = 'loading';
    void this.library.ready().then(() => {
      if (!this.alive) return;
      const loaded = !!this.registry.pack && !this.library.warnings.size;
      this.canvas.dataset.textures = loaded ? 'ready' : 'fallback';
      if (!loaded) this.materialWarning('Textures are unavailable. Showing plain materials.');
    });
  }
  private syncScene(snapshot: StageScene) {
    const flights = snapshot.flights ?? (snapshot.connector ? [{ id: snapshot.connector.sight.id, ...snapshot.connector }] : []);
    for (const [id, lights] of this.stairs) if (!flights.some(f => f.id === id)) {
      for (const light of lights) light.removeFromParent(); this.stairs.delete(id);
    }
    for (const flight of flights) {
      let lights = this.stairs.get(flight.id);
      if (!lights) {
        lights = [new THREE.PointLight('#e7cfac', 16, 12, 1.7), new THREE.PointLight('#e7cfac', 16, 12, 1.7)];
        this.stairs.set(flight.id, lights); this.scene.add(...lights);
      }
      lights[0].position.set(flight.upper.x, flight.upper.y + 2.8, flight.upper.z);
      lights[1].position.set(flight.lower.x, flight.lower.y + 2.8, flight.lower.z);
    }
    this.scene.fog = new THREE.Fog('#10151d', flights.length ? CELL_SIZE * 2 : CELL_SIZE, CELL_SIZE * (flights.length ? 8 : 3.5));
    this.interactables.sync(snapshot.doors ?? []);
    this.canvas.dataset.rooms = String(snapshot.roomCount ?? 0); this.canvas.dataset.flights = String(flights.length);
    const markerCells = snapshot.cells.filter(cell => cell.source.stairs.length && !flights.some(f => [f.upper, f.lower].some(p =>
      Math.abs(p.y - cell.floorY) < .01 && Math.hypot(p.x - cell.center.x, p.z - cell.center.z) < .01)));
    const dynamic = snapshot.boxes.filter(box => ['bookshelf', 'chest'].includes(box.material));
    this.syncMasonry(snapshot.boxes.filter(box => !['bookshelf', 'chest'].includes(box.material)));
    const retained = new Set([...dynamic.map(box => box.id), ...markerCells.map(cell => `${cell.key}/stairs`)]);
    for (const [id, entry] of this.boxes) if (!retained.has(id)) {
      this.scene.remove(entry.object); disposeGeometry(entry.object); this.boxes.delete(id); this.chestStates.delete(id);
    }
    for (const description of dynamic) {
      const signature = JSON.stringify(description), previous = this.boxes.get(description.id);
      if (previous?.description === signature) continue;
      if (previous) { this.scene.remove(previous.object); disposeGeometry(previous.object); }
      const object = this.buildBox(description); this.scene.add(object); this.boxes.set(description.id, { description: signature, object });
    }
    for (const cell of snapshot.cells) for (const chest of cell.source.chests) {
      const group = this.chestStates.get(`${cell.key}/chest/${chest.id}`);
      if (group) applyBlockAppearance(group, this.registry.resolve('chest', { state: chest.opened ? 'open' : 'closed' }), this.library);
    }
    // Stair symbols are flat; physical vertical traversal remains an explicit canonical transition.
    for (const cell of markerCells) {
      const id = `${cell.key}/stairs`, description = JSON.stringify(cell.source.stairs);
      if (this.boxes.has(id)) continue;
      const group = new THREE.Group(); group.position.set(cell.center.x - 0.85, cell.floorY + 0.015, cell.center.z - 0.85);
      const material = this.library.material(this.registry.resolve('basalt').faces[2]);
      for (let i = 0; i < 3; i++) {
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.025, 0.08), material); marker.position.z = i * 0.22; group.add(marker);
      }
      this.scene.add(group); this.boxes.set(id, { description, object: group });
    }
  }
  private syncMasonry(boxes: SceneBox[]) {
    const key = JSON.stringify(boxes); if (key === this.masonryKey) return; this.masonryKey = key;
    disposeGeometry(this.masonry); this.masonry.clear();
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const surfaces = masonrySurfaces(boxes);
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i], geometry = surfaces[i];
      if (!geometry.index?.count) { geometry.dispose(); continue; }
      const face = box.deck === 'floor' ? 2 : box.deck === 'ceiling' ? 3 : 4;
      const surface = this.registry.resolve(box.material).faces[face];
      const shared = box.material === 'unknown' ? this.unknown : this.library.material(surface);
      let material = this.masonryMaterials.get(shared.uuid);
      if (!material) { material = shared.clone(); material.side = THREE.FrontSide; this.masonryMaterials.set(shared.uuid, material); }
      const batch = batches.get(material) ?? []; batch.push(geometry); batches.set(material, batch);
    }
    for (const [material, parts] of batches) {
      const geometry = mergeGeometries(parts, false); for (const part of parts) part.dispose();
      if (geometry) this.masonry.add(new THREE.Mesh(geometry, material));
    }
    // Texture loads update shared materials in place; clones need those same eventual maps.
    void this.library.ready().then(() => {
      if (!this.alive) return;
      const seen = new Set<string>();
      for (const box of boxes) {
        const face = box.deck === 'floor' ? 2 : box.deck === 'ceiling' ? 3 : 4;
        const shared = box.material === 'unknown' ? this.unknown : this.library.material(this.registry.resolve(box.material).faces[face]);
        if (seen.has(shared.uuid)) continue; seen.add(shared.uuid);
        const clone = this.masonryMaterials.get(shared.uuid);
        if (clone instanceof THREE.MeshStandardMaterial && shared instanceof THREE.MeshStandardMaterial && clone.map !== shared.map) {
          clone.copy(shared); clone.side = THREE.FrontSide; clone.needsUpdate = true;
        }
      }
    });
  }
  private buildBox(box: SceneBox): THREE.Object3D {
    if (box.material === 'bookshelf') return bookshelfMesh(box, this.registry, this.library);
    if (box.material === 'chest' && this.registry.pack?.blocks.chest) {
      const group = blockGeometry(this.registry.resolve('chest', { state: 'closed' }), this.library);
      group.position.set(box.center[0], box.center[1] - .52, box.center[2]); group.scale.setScalar(1.2); group.rotation.y = Math.PI;
      this.chestStates.set(box.id, group); return group;
    }
    const face = box.id.endsWith('/floor') ? 2 : box.id.endsWith('/ceiling') ? 3 : 4;
    const surface = this.registry.resolve(box.material).faces[face];
    const material = box.material === 'unknown' ? this.unknown : this.library.material(surface);
    const geometry = stageBoxGeometry(box, surface.material?.surface === 'tileable');
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...box.center); return mesh;
  }
  async setPlayer(catalog: SkinCatalog, selectedId?: string) {
    if (!this.alive || !catalog.skins.length) return;
    this.skinResources = new HumanoidResources(catalog); this.player = new HumanoidModel(this.skinResources); this.scene.add(this.player);
    const skin = catalog.skins.find(skin => skin.id === selectedId) ?? catalog.skins[0];
    await this.player.applyAppearance({ id: 'local-player-appearance', model: skin.model, skinAssetId: skin.id, scale: 1, outerLayerVisible: true });
  }
  async chooseSkin(id: string) {
    const skin = this.skinResources?.catalog.skins.find(s => s.id === id);
    if (skin && this.player) await this.player.applyAppearance({ id: 'local-player-appearance', model: skin.model, skinAssetId: id, scale: 1, outerLayerVisible: true });
  }
  setThirdPerson(value: boolean) { this.thirdPerson = value; }
  interact() { if (!this.walker.stairs && !this.walker.pending) return this.interactables.interact(this.walker.position, this.walker.floorY); }
  look(dx: number, dy: number) { this.yaw -= dx * 0.0025; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0025, -1.1, 1.1); }
  render(seconds: number, moving: boolean) {
    if (!this.alive || this.graphicsLost) return;
    const { x, z } = this.walker.position;
    const y = this.walker.floorY;
    this.camera.position.set(x, y + EYE_HEIGHT, z); this.camera.rotation.order = 'YXZ'; this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.player) {
      this.player.visible = this.thirdPerson; this.player.position.set(x, y, z); this.player.rotation.y = this.yaw + Math.PI;
      this.player.setAnimation(moving ? 'walk' : 'idle'); this.player.update(seconds);
    }
    if (this.thirdPerson && this.player) {
      // Short camera boom contracts against the same solids as player collision.
      const direction = new THREE.Vector3(Math.sin(this.yaw), 0.32, Math.cos(this.yaw)).normalize();
      const solids = [this.masonry, ...this.boxes.values()].map(e => 'object' in e ? e.object : e);
      const ray = new THREE.Raycaster(this.camera.position, direction, 0, 2.8), hit = ray.intersectObjects(solids, true)[0];
      this.camera.position.addScaledVector(direction, Math.max(0, Math.min(2.6, hit ? hit.distance - 0.18 : 2.6)));
      this.camera.lookAt(x, y + 1.65, z);
    }
    this.interactables.update(seconds, this.walker.position, y);
    this.canvas.dataset.doors = String(this.interactables.count); this.canvas.dataset.nearbyControl = this.interactables.nearby(this.walker.position, y);
    this.canvas.dataset.doorStates = JSON.stringify(this.interactables.states);
    this.light.position.set(x, y + 3.3, z); this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.pose = `${x.toFixed(4)},${z.toFixed(4)}`; this.canvas.dataset.yaw = this.yaw.toFixed(4);
    this.canvas.dataset.height = y.toFixed(4); this.canvas.dataset.stairProgress = this.walker.stairs?.progress.toFixed(4) ?? '';
    this.canvas.dataset.pending = String(!!this.walker.pending); this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
    this.canvas.dataset.camera = this.thirdPerson ? 'third' : 'first';
    this.canvas.dataset.geometries = String(this.renderer.info.memory.geometries); this.canvas.dataset.texturesCount = String(this.renderer.info.memory.textures);
  }
  dispose() {
    if (!this.alive) return; this.alive = false; this.observer.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.stairs.clear(); this.interactables.dispose();
    this.player?.dispose(); this.skinResources?.dispose(); disposeGeometry(this.scene);
    for (const material of this.masonryMaterials.values()) material.dispose(); this.masonryMaterials.clear(); this.library.dispose(); this.unknown.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.remove(); this.boxes.clear(); this.chestStates.clear();
  }
}
