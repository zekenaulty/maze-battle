import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { validateModelPack, type ModelPack } from '../../assets3d/models/contract';
import { VisualResources } from '../../assets3d/models/VisualInstance';
import { disposeGeometry } from '../../assets3d/threeAssets';
import type { SceneBox } from './scene';
import { ceilingTimbers, timberGeometry } from './timber';
import type { SupportPart } from './supports';

export const TIMBER_PACK_URL = `${import.meta.env.BASE_URL}assets/model-packs/timber/manifest.json`;
/** Three material batches in the existing renderer; no per-frame allocation or gameplay authority. */
export class StageTimbers {
  readonly root = new THREE.Group();
  private resources = new VisualResources(TIMBER_PACK_URL);
  private abort = new AbortController();
  private alive = true;
  private pack?: ModelPack;
  private latest: SceneBox[] = [];
  private latestSupports: SupportPart[] = [];
  private key = '';
  private members = 0;
  status = 'loading';
  readonly ready: Promise<void>;
  constructor(warning: (message: string) => void, changed = () => {}) {
    this.root.name = 'tilelab-oak-ceiling';
    this.ready = fetch(TIMBER_PACK_URL, { signal: this.abort.signal, cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw Error('Timber pack unavailable');
      const pack: ModelPack = await response.json(); validateModelPack(pack);
      if (!pack.assets['timber-ceiling-oak']) throw Error('Selected timber profile missing');
      for (const role of ['bark', 'wood-planks', 'wood-endgrain']) if (!Object.values(pack.materials).some(m => m.label === role && m.texture)) throw Error('Timber material missing');
      if (!this.alive) return;
      this.pack = pack; this.sync(this.latest, this.latestSupports); await this.resources.ready();
      if (this.alive) { this.status = this.resources.surfaces.warnings.size ? 'fallback' : 'ready'; changed(); }
    }).catch(() => { if (this.alive) { this.status = 'unavailable'; warning('Optional timber ceiling pack unavailable.'); } });
  }
  get count() { return this.members; }
  get available() { return !!this.pack; }
  sync(boxes: SceneBox[], supports: SupportPart[] = []) {
    this.latest = boxes; this.latestSupports = supports; if (!this.pack || !this.alive) return;
    const key = JSON.stringify([boxes.filter(b => b.deck === 'ceiling' || ['stone_bricks', 'unknown'].includes(b.material)), supports]);
    if (key === this.key) return; this.key = key;
    const members = ceilingTimbers(boxes); this.members = members.length;
    disposeGeometry(this.root); this.root.clear();
    const batches = new Map<string, THREE.BufferGeometry[]>();
    for (const member of members) {
      const geometry = timberGeometry(member);
      for (const [role, part] of [[member.role === 'joist' ? 'bark' : 'wood-planks', geometry.sides], ['wood-endgrain', geometry.ends]] as const) {
        const parts = batches.get(role) ?? []; parts.push(part); batches.set(role, parts);
      }
    }
    for (const { box, lean } of supports) {
      const axis = box.size[1] > box.size[0] ? 1 : 0;
      const local = timberGeometry({ min: box.size.map(n => -n / 2) as [number, number, number], max: box.size.map(n => n / 2) as [number, number, number], role: 'trim', axis, origin: [0, 0, 0] });
      const matrix = new THREE.Matrix4().makeRotationZ(lean ?? 0); matrix.setPosition(...box.center);
      for (const [role, part] of [['wood-planks', local.sides], ['wood-endgrain', local.ends]] as const) {
        part.applyMatrix4(matrix); const list = batches.get(role) ?? []; list.push(part); batches.set(role, list);
      }
    }
    for (const [role, parts] of batches) {
      const geometry = mergeGeometries(parts, false); for (const part of parts) part.dispose();
      const material = Object.values(this.pack.materials).find(m => m.label === role)!;
      if (geometry) this.root.add(new THREE.Mesh(geometry, this.resources.material('front', material)));
    }
  }
  dispose() { this.alive = false; this.abort.abort(); disposeGeometry(this.root); this.root.clear(); this.resources.dispose(); }
}
