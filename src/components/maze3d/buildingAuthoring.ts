import { straightStair } from '../../assets3d/stairs/assembly';
import { BUILDING, planBuildingConstruction, type ResolvedBuildingFlight } from '../../domain/construction/buildingPlan';
import type { BuildingConstructionBrief, Vector3 } from '../../domain/construction/types';

/** Adapter between the retained native asset recipe and pure complete building planning. */
export function resolveBuildingFlight(): ResolvedBuildingFlight {
  const source = straightStair({ rise: BUILDING.rise });
  return { revision: source.revision, rise: source.rise, run: source.run, width: source.width, landing: source.landing,
    parts: source.model.payload.geometries.flight.filter(p => p.size && !p.id.endsWith('landing')).map(p => ({ id: p.id,
      min: p.position.map((n, i) => n - p.size![i] / 2) as Vector3, max: p.position.map((n, i) => n + p.size![i] / 2) as Vector3 })) };
}
export const planAuthoringBuilding = (brief: BuildingConstructionBrief) => planBuildingConstruction(brief, resolveBuildingFlight());
