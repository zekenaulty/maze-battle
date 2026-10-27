import { validateModelPack, type ModelPack } from '../../assets3d/models/contract';
import { VisualResources } from '../../assets3d/models/VisualInstance';
export const STAGE_DETAILS_URL = `${import.meta.env?.BASE_URL ?? '/'}assets/model-packs/stage-details/manifest.json`;
export class StageDetailMaterials {
  private resources = new VisualResources(STAGE_DETAILS_URL);
  private pack?: ModelPack;
  private alive = true;
  private abort = new AbortController();
  readonly ready: Promise<void>;
  constructor(changed: () => void) {
    this.ready = fetch(STAGE_DETAILS_URL, { signal: this.abort.signal, cache: 'no-cache' }).then(async response => {
      if (!response.ok) return; const pack: ModelPack = await response.json(); validateModelPack(pack);
      if (this.alive && pack.materials.riser && pack.materials.metal) { this.pack = pack; changed(); }
    }).catch(() => {});
  }
  get available() { return !!this.pack; }
  material(role: 'riser' | 'metal') { return this.resources.material('front', this.pack!.materials[role]); }
  async settled() { await this.ready; await this.resources.ready(); }
  dispose() { this.alive = false; this.abort.abort(); this.resources.dispose(); }
}
