import * as THREE from 'three';
import { HumanoidModel } from './HumanoidModel';
import { HumanoidResources } from './HumanoidResources';
import type { HumanoidAnimation } from './animation';
import type { SkinAsset } from './contract';

export interface LineupOptions {
  scale: number; outer: boolean; animation: HumanoidAnimation; wireframe: boolean;
  heading: number; headYaw: number; headPitch: number;
}
/** Independent visual instances sharing the scene's geometry and skin resources. */
export class HumanoidLineup extends THREE.Group {
  readonly members: HumanoidModel[];
  readonly assets: SkinAsset[];
  constructor(resources: HumanoidResources) {
    super(); this.name = 'humanoid-lineup';
    this.assets = resources.catalog.skins.filter(s => s.provenance.kind === 'generated');
    const rows = Math.ceil(this.assets.length / 3);
    this.members = this.assets.map((_asset, i) => {
      const model = new HumanoidModel(resources), row = Math.floor(i / 3), columns = Math.min(3, this.assets.length - row * 3);
      model.position.set((i % 3 - (columns - 1) / 2) * 2.8, 0, (row - (rows - 1) / 2) * 3.3);
      this.add(model); return model;
    });
  }
  configure(options: LineupOptions) {
    return Promise.all(this.members.map((model, i) => {
      const asset = this.assets[i];
      const ready = model.applyAppearance({ id: `lineup-${asset.id}`, model: asset.model, skinAssetId: asset.id,
        scale: options.scale, outerLayerVisible: options.outer });
      model.setAnimation(options.animation); model.setWireframe(options.wireframe); model.rotation.y = options.heading * Math.PI / 180;
      model.setHeadOrientation(options.headYaw * Math.PI / 180, options.headPitch * Math.PI / 180); return ready;
    }));
  }
  update(seconds: number) { this.members.forEach((model, i) => model.update(seconds + i * 0.13)); }
  ready() { return Promise.all(this.members.map(model => model.ready())); }
  get loaded() { return this.members.every(model => !!model.loadedSkinId); }
  resetPose() { for (const model of this.members) model.resetPose(); }
  dispose() { for (const model of this.members) model.dispose(); this.removeFromParent(); }
}
