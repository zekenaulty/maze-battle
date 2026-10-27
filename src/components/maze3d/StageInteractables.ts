import * as THREE from 'three';
import { MODEL_PACK_URL, validateModelPack, type ModelPack } from '../../assets3d/models/contract';
import { VisualInstance, VisualResources } from '../../assets3d/models/VisualInstance';
import type { StageDoor, Point } from './scene';
import { DOOR_HEIGHT, DOOR_WIDTH } from './constants';

interface DoorDisplay {
  spec: StageDoor; root: THREE.Group; door: VisualInstance; levers: VisualInstance[]; buttons: VisualInstance[];
  controls: { object: THREE.Group; kind: 'lever' | 'button' }[]; open: boolean; approaching: boolean; pressedUntil: number;
}
/** Visual door controls. Passage authority stays in the canonical graph; doors open on approach. */
export class StageInteractables {
  private scene: THREE.Scene;
  private resources = new VisualResources(MODEL_PACK_URL);
  private pack?: ModelPack;
  private latest: StageDoor[] = [];
  private displays = new Map<string, DoorDisplay>();
  private abort = new AbortController();
  private alive = true;
  private clock = 0;
  readonly ready: Promise<void>;
  constructor(scene: THREE.Scene, warning: (message: string) => void) {
    this.scene = scene;
    this.ready = fetch(MODEL_PACK_URL, { signal: this.abort.signal, cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw Error('Model pack unavailable');
      const pack: ModelPack = await response.json(); validateModelPack(pack);
      if (!this.alive) return; this.pack = pack; this.sync(this.latest); await this.resources.surfaces.ready();
      if (this.resources.surfaces.warnings.size) warning('Some door/control textures are unavailable.');
    }).catch(() => { if (this.alive) warning('Door and control models are unavailable. Retry materials to reload them.'); });
  }
  private instance(id: string, state: string) {
    const pack = this.pack!, asset = pack.assets[id]; if (!asset) return;
    const instance = new VisualInstance(asset, this.resources);
    instance.bindMaterials(Object.fromEntries(Object.entries(pack.bindings[id]).map(([slot, material]) => [slot, pack.materials[material]])));
    instance.setVisualState(state); return instance;
  }
  sync(specs: StageDoor[]) {
    this.latest = specs; if (!this.pack) return;
    const ids = new Set(specs.map(d => d.id));
    for (const [id, display] of this.displays) if (!ids.has(id)) { this.remove(display); this.displays.delete(id); }
    for (const spec of specs) {
      let display = this.displays.get(spec.id);
      if (!display) {
        const door = this.instance('iron-door-source', 'closed'); if (!door) continue;
        const root = new THREE.Group(); root.add(door.root); root.name = 'door/' + spec.id;
        door.root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(door.root), size = bounds.getSize(new THREE.Vector3()), middle = bounds.getCenter(new THREE.Vector3());
        door.root.scale.set(DOOR_WIDTH / size.x, DOOR_HEIGHT / size.y, DOOR_WIDTH / size.x);
        door.root.position.set(-middle.x * door.root.scale.x, -bounds.min.y * door.root.scale.y, -middle.z * door.root.scale.z);
        display = { spec, root, door, levers: [], buttons: [], controls: [], open: false, approaching: false, pressedUntil: 0 };
        for (const side of [-1, 1]) for (const kind of ['lever', 'button'] as const) {
          const model = this.instance(kind === 'lever' ? 'lever-wall-source' : 'stone-button-wall-source', 'off'); if (!model) continue;
          const mount = new THREE.Group(); mount.position.set((kind === 'lever' ? 1 : -1) * side * 1.25, 1.55, side * .09);
          mount.rotation.y = side === 1 ? 0 : Math.PI; mount.add(model.root); root.add(mount);
          model.root.updateMatrixWorld(true);
          // Normalize source extent in its own frame before mounting it on the wall face.
          mount.remove(model.root); if (kind === 'button') model.root.rotation.y = Math.PI; model.root.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(model.root), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
          const scale = Math.min(.58 / Math.max(s.x, s.y), .8); model.root.scale.setScalar(scale);
          model.root.position.set(-c.x * scale, -c.y * scale, -b.min.z * scale); mount.add(model.root);
          (kind === 'lever' ? display.levers : display.buttons).push(model); display.controls.push({ object: mount, kind });
        }
        this.scene.add(root); this.displays.set(spec.id, display);
      }
      display.spec = spec; display.root.position.set(...spec.center); display.root.rotation.y = spec.horizontal ? 0 : Math.PI / 2;
    }
  }
  private setOpen(display: DoorDisplay, value: boolean) {
    if (display.open === value) return;
    display.open = value; display.door.setVisualState(value ? 'open' : 'closed');
    for (const lever of display.levers) lever.setVisualState(value ? 'on' : 'off');
  }
  update(seconds: number, position: Point, footY: number) {
    this.clock = seconds;
    for (const d of this.displays.values()) {
      const dx = position.x - d.spec.center[0], dz = position.z - d.spec.center[2];
      const along = d.spec.horizontal ? dx : dz, across = d.spec.horizontal ? dz : dx;
      const approaching = Math.abs(footY - d.spec.center[1]) < .6 && Math.abs(along) < .8 && Math.abs(across) < 1.6;
      if (approaching && !d.approaching) this.setOpen(d, true);
      d.approaching = approaching;
      for (const button of d.buttons) { const state = seconds < d.pressedUntil ? 'on' : 'off'; if (button.currentState !== state) button.setVisualState(state); }
    }
  }
  private nearest(position: Point, footY: number) {
    let closest: { display: DoorDisplay; kind: 'lever' | 'button'; distance: number } | undefined;
    for (const display of this.displays.values()) for (const control of display.controls) {
      const at = control.object.getWorldPosition(new THREE.Vector3());
      const distance = Math.hypot(at.x - position.x, at.z - position.z, at.y - footY - 1.55);
      if (distance < 2.5 && (!closest || distance < closest.distance)) closest = { display, kind: control.kind, distance };
    }
    return closest;
  }
  interact(position: Point, footY: number) {
    const target = this.nearest(position, footY); if (!target) return;
    this.setOpen(target.display, !target.display.open);
    if (target.kind === 'button') target.display.pressedUntil = this.clock + .3;
    return (target.kind === 'button' ? 'Button pressed' : 'Lever switched') + ' · door ' + (target.display.open ? 'open' : 'closed');
  }
  nearby(position: Point, footY: number) { return this.nearest(position, footY)?.kind ?? ''; }
  interactionDistance(position: Point, footY: number) { return this.nearest(position, footY)?.distance ?? Infinity; }
  get count() { return this.displays.size; }
  get states() { return [...this.displays.values()].map(d => ({ id: d.spec.id, open: d.open,
    leverStates: d.levers.map(v => v.currentState), buttonStates: d.buttons.map(v => v.currentState) })); }
  get objects() { return [...this.displays.values()].map(d => d.root); }
  private remove(d: DoorDisplay) { d.root.removeFromParent(); d.door.dispose(); for (const v of [...d.levers, ...d.buttons]) v.dispose(); }
  dispose() { this.alive = false; this.abort.abort(); for (const d of this.displays.values()) this.remove(d); this.displays.clear(); this.resources.dispose(); }
}
