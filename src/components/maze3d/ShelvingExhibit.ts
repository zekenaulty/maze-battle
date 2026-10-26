import * as THREE from 'three';
import { validateModelPack, type ModelPack } from '../../assets3d/models/contract';
import { VisualInstance, VisualResources } from '../../assets3d/models/VisualInstance';
import { loadSkinCatalog } from '../../assets3d/humanoid/contract';
import { HumanoidResources } from '../../assets3d/humanoid/HumanoidResources';
import { HumanoidModel } from '../../assets3d/humanoid/HumanoidModel';
import { SHELVING, SHELVING_PACK_URL, type ShelvingKind } from './shelving';
/** Inspection in the existing workshop renderer, including producer cabinet hinge poses. */
export class ShelvingExhibit {
  readonly root = new THREE.Group();
  private resources = new VisualResources(SHELVING_PACK_URL);
  private models = new Map<ShelvingKind, VisualInstance>();
  private floor = new THREE.Mesh(new THREE.BoxGeometry(7, .12, 4), new THREE.MeshStandardMaterial({ color: '#4a4d50', roughness: .9 }));
  private reference = new THREE.Mesh(new THREE.BoxGeometry(.4, 2.7, .4), new THREE.MeshStandardMaterial({ color: '#a5b7a8' }));
  private skinResources?: HumanoidResources;
  private player?: HumanoidModel;
  private alive = true;
  private load?: Promise<void>;
  private selected: ShelvingKind = 'low-bookcase';
  private open = false;
  private wireframe = false;
  status = 'Loading shelving…';
  private canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas; this.floor.position.set(.5, -.07, 0); this.reference.position.set(2.1, 1.35, 0); this.root.add(this.floor, this.reference);
  }
  ensureLoaded(signal: AbortSignal, changed: (status: string) => void) {
    if (this.load) return this.load;
    this.load = (async () => {
      try {
        const response = await fetch(SHELVING_PACK_URL, { signal, cache: 'no-cache' }); if (!response.ok) throw Error('Shelving pack unavailable; run the selected shelving importer.');
        const pack: ModelPack = await response.json(); validateModelPack(pack); if (!this.alive) return;
        for (const [kind, profile] of Object.entries(SHELVING)) {
          const asset = pack.assets[profile.assetId]; if (!asset) throw Error('Selected shelving model missing');
          const model = new VisualInstance(asset, this.resources); model.bindMaterials(Object.fromEntries(Object.entries(pack.bindings[asset.id]).map(([slot, id]) => [slot, pack.materials[id]])));
          model.root.position.y = profile.mount; this.root.add(model.root); this.models.set(kind as ShelvingKind, model);
        }
        this.update(this.selected, this.open, this.wireframe); await this.resources.ready(); if (!this.alive) return;
        if (this.resources.surfaces.warnings.size) throw Error('Some shelving textures are unavailable.');
        this.update(this.selected, this.open, this.wireframe);
        this.canvas.dataset.shelvingReady = 'true'; this.canvas.dataset.shelvingRevision = pack.revision;
        this.status = 'Five shelving models · decorative books · character scale comparison'; changed(this.status);
        // The known local skin is an optional reference; failure retains the measured column.
        try {
          const catalog = await loadSkinCatalog(signal); if (!this.alive || !catalog.skins.length) return;
          this.skinResources = new HumanoidResources(catalog); this.player = new HumanoidModel(this.skinResources);
          this.player.position.set(2.1, 0, 0); this.root.add(this.player); const skin = catalog.skins[0];
          await this.player.applyAppearance({ id: 'shelving-scale-reference', model: skin.model, skinAssetId: skin.id, scale: 1, outerLayerVisible: true });
          if (this.alive) { this.reference.visible = false; this.canvas.dataset.shelvingAvatar = 'ready'; }
        } catch { /* Numeric column remains the reference if optional character art is absent. */ }
      } catch (error) { if (this.alive && !signal.aborted) { this.canvas.dataset.shelvingReady = 'false'; this.status = String(error); changed(this.status); } }
    })(); return this.load;
  }
  update(kind: ShelvingKind, open: boolean, wireframe: boolean) {
    this.selected = kind; this.open = open; this.wireframe = wireframe;
    for (const [key, model] of this.models) {
      model.root.visible = key === kind; model.setVisualState(key === 'cabinet' ? open ? 'open' : 'closed' : 'default'); model.setWireframe(wireframe);
    }
    this.canvas.dataset.shelvingKind = kind; this.canvas.dataset.cabinetPose = open ? 'open' : 'closed';
  }
  dispose() {
    this.alive = false; for (const model of this.models.values()) model.dispose(); this.models.clear(); this.resources.dispose();
    this.player?.dispose(); this.skinResources?.dispose(); this.floor.geometry.dispose(); this.floor.material.dispose(); this.reference.geometry.dispose(); this.reference.material.dispose(); this.root.removeFromParent();
  }
}
