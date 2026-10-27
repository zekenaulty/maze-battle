import * as THREE from 'three';
import { validateBuildingComposition, type BuildingComposition } from '../../domain/construction/buildingPlan';
import { ConstructionResources, ConstructionVisual } from './constructionVisual';
import { masonryUV } from './construction';

/** Shared resources, independent instance frames. Complete static source for export. */
export class BuildingCompositionVisual {
  readonly root = new THREE.Group();
  private buildings: ConstructionVisual[] = [];
  private groundGeometries: THREE.BufferGeometry[] = [];
  constructor(composition: BuildingComposition, resources: ConstructionResources) {
    validateBuildingComposition(composition);
    this.root.name = composition.id;
    this.root.userData = { profile: composition.version, realmId: composition.realmId,
      frame: { units: 'world', axes: 'right-handed-y-up', forward: '-z' },
      recipe: { version: composition.version, street: composition.street, alley: composition.alley,
        buildings: composition.buildings.map(b => ({ id: b.id, realmId: b.realmId, translation: b.translation, brief: b.plan.brief,
          profile: b.plan.profile, frame: b.plan.frame, dependencies: b.plan.dependencies })) } };
    for (const b of composition.buildings) {
      const visual = new ConstructionVisual(b.plan, resources); visual.root.position.set(...b.translation);
      visual.root.userData.instanceId = b.id; visual.root.userData.realmId = b.realmId;
      this.root.add(visual.root); this.buildings.push(visual);
    }
    for (const [key, surface] of [['street', composition.street], ['alley', composition.alley]] as const) {
      const { min, max } = surface;
      const geometry = new THREE.BoxGeometry(...max.map((n, i) => n - min[i]) as [number, number, number]);
      geometry.translate(...max.map((n, i) => (n + min[i]) / 2) as [number, number, number]);
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < p.count; i++) uv.setXY(i, ...masonryUV([p.getX(i), p.getY(i), p.getZ(i)], [n.getX(i), n.getY(i), n.getZ(i)], [0, 0, 0]));
      const block = resources.registry.resolve('cobblestone'); if (block.warnings.length) throw Error('Selected street material missing');
      const street = new THREE.Mesh(geometry, block.faces.map(f => resources.masonry.material(f)));
      street.name = composition.id + '/' + key; street.userData = { role: 'floor', realmId: composition.realmId };
      this.root.add(street); this.groundGeometries.push(geometry);
    }
  }
  cutaway(active: boolean, lowerStorey = false) { this.buildings.forEach(b => b.cutaway(active, lowerStorey)); }
  dispose() { this.buildings.forEach(b => b.dispose()); this.groundGeometries.forEach(g => g.dispose()); this.root.removeFromParent(); this.root.clear(); }
}
