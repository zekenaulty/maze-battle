import * as THREE from 'three';
import type { GameView } from '../../services/game/GameView';
import { AssetRegistry } from '../../assets3d/registry';
import { ThreeAssetLibrary, blockGeometry, applyBlockAppearance, disposeGeometry } from '../../assets3d/threeAssets';
import { HumanoidResources } from '../../assets3d/humanoid/HumanoidResources';
import { HumanoidModel } from '../../assets3d/humanoid/HumanoidModel';
import type { SkinCatalog } from '../../assets3d/humanoid/contract';
import { compileStageScene } from './scene';
import type { SceneBox, StageScene } from './scene';
import { StageWalker } from './movement';
import { CELL_SIZE, EYE_HEIGHT } from './constants';
import { alignBoxUVs } from './boxUVs';
import { bookshelfMesh } from './bookshelf';
import { straightStair } from '../../assets3d/stairs/assembly';
import { VisualInstance, VisualResources } from '../../assets3d/models/VisualInstance';
import { nativeMaterials } from '../../assets3d/models/native';

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
  private stairResources = new VisualResources('');
  private stairModel?: VisualInstance;
  private stairId?: string;
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
    const connector = snapshot.connector;
    if (connector?.sight.id !== this.stairId) {
      if (this.stairModel) { this.scene.remove(this.stairModel.root); this.stairModel.dispose(); this.stairModel = undefined; }
      this.stairId = connector?.sight.id;
      if (connector) {
        const stair = straightStair(), asset = { ...stair.model, geometryRevision: `${stair.model.geometryRevision}/room-decks`,
          payload: { geometries: { flight: stair.model.payload.geometries.flight.filter(p => !p.id.endsWith('landing')) } } };
        this.stairModel = new VisualInstance(asset, this.stairResources);
        this.stairModel.bindMaterials({ structure: nativeMaterials.native_stone, treads: nativeMaterials.native_stone, rails: nativeMaterials.native_bronze });
        this.stairModel.setVisualState('neutral');
        this.scene.add(this.stairModel.root);
      }
    }
    if (connector && this.stairModel) this.stairModel.root.position.set(connector.lower.x, connector.lower.y, connector.lower.z + .9);
    const markerCells = snapshot.cells.filter(cell => cell.source.stairs.length && (!connector || ![connector.sight.upper, connector.sight.lower].some(at => JSON.stringify(at) === JSON.stringify(cell.source.at))));
    const retained = new Set([...snapshot.boxes.map(box => box.id), ...markerCells.map(cell => `${cell.key}/stairs`)]);
    for (const [id, entry] of this.boxes) if (!retained.has(id)) {
      this.scene.remove(entry.object); disposeGeometry(entry.object); this.boxes.delete(id); this.chestStates.delete(id);
    }
    for (const description of snapshot.boxes) {
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
    for (const cell of snapshot.cells) {
      if (!cell.source.stairs.length || snapshot.connector && [snapshot.connector.sight.upper, snapshot.connector.sight.lower].some(at => JSON.stringify(at) === JSON.stringify(cell.source.at))) continue;
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
    const geometry = new THREE.BoxGeometry(...box.size);
    if (surface.material?.surface === 'tileable') alignBoxUVs(geometry, box.center);
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
      const solids = [...this.boxes.values()].map(e => e.object);
      const ray = new THREE.Raycaster(this.camera.position, direction, 0, 2.8), hit = ray.intersectObjects(solids, true)[0];
      this.camera.position.addScaledVector(direction, Math.max(0, Math.min(2.6, hit ? hit.distance - 0.18 : 2.6)));
      this.camera.lookAt(x, y + 1.65, z);
    }
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
    this.stairModel?.dispose(); this.stairResources.dispose(); this.player?.dispose(); this.skinResources?.dispose(); disposeGeometry(this.scene); this.library.dispose(); this.unknown.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.remove(); this.boxes.clear(); this.chestStates.clear();
  }
}
