// @vitest-environment node
import { expect, it } from 'vitest';
import { planAuthoringStairwell } from './stairwellAuthoring';
import { straightStair } from '../../assets3d/stairs/assembly';
import { overlapsConstruction } from '../../domain/construction/roomPlan';

it('builds a complete bounded two-level well from preserved flight parts with clear shaft and landing anchors', () => {
  for (const options of [{}, { rise: 4.5, tread: .4, steps: 16 }]) {
    const plan = planAuthoringStairwell(options), stair = straightStair(options);
    expect(planAuthoringStairwell(options)).toEqual(plan);
    expect(plan.members.filter(m => m.id.includes('/flight/tread-'))).toHaveLength(stair.steps);
    expect(plan.anchors.find(a => a.id.endsWith('/lower-landing'))!.position).toEqual(stair.anchors.lower);
    expect(plan.anchors.find(a => a.id.endsWith('/upper-landing'))!.position).toEqual(stair.anchors.upper);
    const shaft = { min: [-.9, stair.rise - .17, .001] as [number, number, number],
      max: [.9, stair.rise, stair.run - .001] as [number, number, number] };
    expect(plan.members.filter(m => m.id.includes('/upper-floor/')).some(m => overlapsConstruction(m, shaft))).toBe(false);
    expect(plan.members.filter(m => m.role === 'post').some(m => overlapsConstruction(m, plan.routes[0]))).toBe(false);
  }
});
