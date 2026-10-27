import { planRoomConstruction } from '../../domain/construction/roomPlan';
import type { RoomConstructionBrief } from '../../domain/construction/types';
import { ConstructionResources, ConstructionVisual, StaticCabinetVisual } from './constructionVisual';
import { planAuthoringStairwell } from './stairwellAuthoring';
export type AuthoringAssemblyKind = 'room' | 'stairwell' | 'cabinet';
export function buildAuthoringAssembly(kind: AuthoringAssemblyKind, brief: RoomConstructionBrief, resources: ConstructionResources) {
  if (kind === 'cabinet') return { visual: new StaticCabinetVisual(resources), plan: undefined };
  const plan = kind === 'stairwell' ? planAuthoringStairwell() : planRoomConstruction(brief);
  return { visual: new ConstructionVisual(plan, resources), plan };
}
