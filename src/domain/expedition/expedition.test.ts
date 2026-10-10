import { describe, expect, it } from 'vitest';
import { applyExpeditionCommand, createExpeditionCheckpoint } from './commands';
import { createExpeditionPlan, materializeSpace } from './generation';
import { chooseExplorationDecision } from './exploration';
import { sameAddress } from './address';

describe('isolated exploration qualification', () => {
  it.each([1, 7, 42, 20261008])('explores, collects, resumes and returns without oracle pathing: seed %i', seed => {
    const plan = createExpeditionPlan({ version: 'spaces-v1', worldId: 'qualification', floorId: 'floor-1', seed, level: 1 });
    const geometries = new Map(plan.spaces.map(spec => [spec.id, materializeSpace(spec)]));
    const read = (spec: typeof plan.spaces[number]) => geometries.get(spec.id)!;
    let checkpoint = createExpeditionCheckpoint(plan, read);
    let commands = 0;
    while (checkpoint.phase !== 'complete' && commands < 4000) {
      const decision = chooseExplorationDecision(checkpoint);
      expect(decision.command, decision.reason).toBeDefined();
      const transition = applyExpeditionCommand(plan, checkpoint, decision.command!, read);
      expect(transition.applied, `${decision.reason}: ${transition.reason}`).toBe(true);
      checkpoint = transition.checkpoint;
      if (commands % 37 === 0) checkpoint = structuredClone(checkpoint);
      commands++;
    }
    expect(checkpoint.phase).toBe('complete');
    expect(sameAddress(checkpoint.position, checkpoint.home)).toBe(true);
    expect(checkpoint.openedChestIds).toHaveLength(plan.spaces.flatMap(spec => spec.chests).length);
    expect(new Set(Object.values(checkpoint.knowledge.cells).map(cell => cell.spaceId)).size).toBe(plan.spaces.length);
  });
});
