import { describe, expect, it } from 'vitest';
import { BUILDING, composeBuildingPair, translatedBounds, validateBuildingComposition } from './buildingPlan';
import { overlapsConstruction, planRoomConstruction, validateConstructionPlan } from './roomPlan';
import { planAuthoringBuilding, resolveBuildingFlight } from '../../components/maze3d/buildingAuthoring';

describe('bounded building composition', () => {
  it.each(['empty', 'library'] as const)('%s: composes two storeys with real open shaft, landings, supported cuts and safe exterior windows', purpose => {
    const brief = { id: 'building-proof', seed: 42, purpose, storeys: 2 as const };
    const plan = planAuthoringBuilding(brief);
    expect(plan).toEqual(planAuthoringBuilding(brief)); validateConstructionPlan(plan);
    expect(plan.furnishings).toHaveLength(purpose === 'library' ? 10 : 0);
    expect(plan.anchors.filter(a => a.kind === 'window')).toHaveLength(2);
    expect(plan.anchors.filter(a => a.kind === 'door' && !a.id.includes('/landing/')).every(a => a.position[1] === 0)).toBe(true);
    const hole = { min: [-4.3, 0, -3.78] as [number, number, number], max: [-2.1, BUILDING.rise + 2.7, 3.78] as [number, number, number] };
    expect(plan.members.filter(m => !m.id.includes('/flight/') && overlapsConstruction(m, hole))).toEqual([]);
    const flight = resolveBuildingFlight();
    for (const part of flight.parts) {
      const member = plan.members.find(m => m.id.endsWith('/flight/' + part.id))!;
      member.min.forEach((n, i) => expect(n).toBeCloseTo(part.min[i] + (i === 0 ? -3.2 : i === 2 ? -3.78 : 0), 5));
      member.max.forEach((n, i) => expect(n).toBeCloseTo(part.max[i] + (i === 0 ? -3.2 : i === 2 ? -3.78 : 0), 5));
    }
    for (const side of [-1, 1]) {
      const landing = plan.anchors.find(a => a.id.endsWith('/landing/' + side))!;
      const floor = plan.members.find(m => m.role === 'floor' && !m.id.includes('/flight/') && m.max[1] === landing.position[1]
        && landing.position[0] > m.min[0] && landing.position[0] < m.max[0] && landing.position[2] > m.min[2] && landing.position[2] < m.max[2]);
      expect(floor).toBeDefined();
    }
    expect(plan.members.some(m => m.sourceMemberId?.includes('/joist/'))).toBe(true);
    expect(plan.members.filter(m => m.role === 'post').every(m => m.bearings?.length === 2)).toBe(true);
    expect(plan.members.filter(m => m.role === 'joist').every(m => m.min[2] >= -8 && m.max[2] <= 8)).toBe(true);
    expect(plan.members.filter(m => m.id.includes('/parapet/'))).toHaveLength(4);
  });
  it('reserves storage before planning and leaves the original plan untouched', () => {
    const input = { id: 'room', seed: 4, rows: 5 as const, columns: 3 as const, purpose: 'library' as const };
    const complete = planRoomConstruction(input), snapshot = structuredClone(complete);
    const reserved = planRoomConstruction({ ...input, storageExclusions: [{ min: [-4.8, 0, -8], max: [-2, 3, 8] }] });
    expect(complete).toEqual(snapshot); expect(complete.furnishings).toHaveLength(10); expect(reserved.furnishings).toHaveLength(5);
    expect(reserved.furnishings.every(f => f.position[0] > 0)).toBe(true);
  });
  it('joins a street at both entrances, preserves a side gap and rejects overlap/realm/vertical mismatches', () => {
    const left = planAuthoringBuilding({ id: 'library', seed: 42, purpose: 'library', storeys: 2 });
    const right = planAuthoringBuilding({ id: 'empty', seed: 73, purpose: 'empty', storeys: 2 });
    const pair = composeBuildingPair(left, right); validateBuildingComposition(pair);
    const a = translatedBounds(left.bounds, pair.buildings[0].translation), b = translatedBounds(right.bounds, pair.buildings[1].translation);
    expect(b.min[0] - a.max[0]).toBeCloseTo(1.6, 5);
    for (const failure of ['overlap', 'realm', 'height'] as const) {
      const bad = structuredClone(pair);
      if (failure === 'overlap') bad.buildings[1].translation[0] = bad.buildings[0].translation[0];
      if (failure === 'realm') bad.buildings[1].realmId = 'independent-dungeon';
      if (failure === 'height') bad.buildings[1].translation[1] = 1;
      expect(() => validateBuildingComposition(bad)).toThrow();
    }
  });
});
