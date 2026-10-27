import { planRoomConstruction } from '../../domain/construction/roomPlan';
import type { RoomConstructionBrief } from '../../domain/construction/types';
import { ConstructionResources, ConstructionVisual, StaticCabinetVisual } from './constructionVisual';
import { planAuthoringStairwell } from './stairwellAuthoring';
import { planAuthoringBuilding } from './buildingAuthoring';
import { composeBuildingPair } from '../../domain/construction/buildingPlan';
import { BuildingCompositionVisual } from './buildingVisual';
export interface AuthoringVisual { root: import('three').Group; cutaway(active: boolean, lowerStorey?: boolean): void; dispose(): void }
export type AuthoringAssemblyKind = 'room' | 'stairwell' | 'cabinet' | 'building' | 'street';
export function buildAuthoringAssembly(kind: AuthoringAssemblyKind, brief: RoomConstructionBrief, resources: ConstructionResources) {
  if (kind === 'cabinet') return { visual: new StaticCabinetVisual(resources), plan: undefined };
  if (kind === 'building' || kind === 'street') {
    const plan = planAuthoringBuilding({ id: 'building-proof', seed: brief.seed, purpose: brief.purpose, storeys: 2 });
    if (kind === 'building') return { visual: new ConstructionVisual(plan, resources), plan };
    const pair = composeBuildingPair(plan, planAuthoringBuilding({ id: 'empty-neighbor', seed: brief.seed + 1, purpose: 'empty', storeys: 2 }));
    return { visual: new BuildingCompositionVisual(pair, resources), plan: undefined };
  }
  const plan = kind === 'stairwell' ? planAuthoringStairwell() : planRoomConstruction(brief);
  return { visual: new ConstructionVisual(plan, resources), plan };
}
