import { describe, expect, it } from 'vitest';
import { applyExpeditionCommand, createExpeditionCheckpoint } from './commands';
import { observeExpedition } from './observation';
import type { ExpeditionPlan, SpaceGeometry, SpaceSpec } from './types';

const space = (id: string): SpaceSpec => ({ id, kind: 'room', name: id, origin: { row: 0, column: 0 }, rows: 1, columns: 7, seed: 4, openings: [], chests: [] });
const a = space('a');
const b = space('b');
a.openings.push({ id: 'a-east', cell: { row: 0, column: 6 }, direction: 'east', destination: { spaceId: 'b', row: 0, column: 0 } });
b.openings.push({ id: 'b-west', cell: { row: 0, column: 0 }, direction: 'west', destination: { spaceId: 'a', row: 0, column: 6 } });
b.chests.push({ id: 'secret-cache', cell: { row: 0, column: 6 } });
const plan: ExpeditionPlan = {
  recipe: { version: 'spaces-v1', worldId: 'world', floorId: 'floor', level: 1, seed: 4 }, scopeId: 'scope',
  start: { spaceId: 'a', row: 0, column: 0 }, spaces: [a, b],
};
function read(spec: SpaceSpec): SpaceGeometry {
  return { spaceId: spec.id, rows: 1, columns: 7, cells: Array.from({ length: 7 }, (_, column) => ({ row: 0, column, links: column === 0 ? ['east'] : column === 6 ? ['west'] : ['east', 'west'] })) };
}

describe('bounded expedition commands', () => {
  it('projects only currently visible facts, not generated rooms, unopened targets or seeds', () => {
    const checkpoint = createExpeditionCheckpoint(plan, read);
    const observation = observeExpedition(checkpoint, a, read(a));
    expect(observation.visibleCells).toHaveLength(5);
    expect(observation.visibleOpenings).toEqual([]);
    expect(observation.visibleChests).toEqual([]);
    expect(JSON.stringify(observation)).not.toContain('secret-cache');
    expect(observation).not.toHaveProperty('recipe');
    expect(observation).not.toHaveProperty('seed');
    expect(observation).not.toHaveProperty('spaces');
  });

  it('learns openings by crossing, preserves knowledge, and never repeats chest collection', () => {
    let checkpoint = createExpeditionCheckpoint(plan, read);
    const initial = structuredClone(checkpoint);
    for (let i = 0; i < 13; i++) checkpoint = applyExpeditionCommand(plan, checkpoint, { type: 'move', direction: 'east' }, read).checkpoint;
    expect(initial.position).toEqual(plan.start);
    expect(checkpoint.position).toEqual({ spaceId: 'b', row: 0, column: 6 });
    expect(checkpoint.knowledge.openings['a-east'].destination?.spaceId).toBe('b');
    expect(checkpoint.knowledge.openings['b-west'].destination?.spaceId).toBe('a');
    const collected = applyExpeditionCommand(plan, checkpoint, { type: 'collect' }, read);
    expect(collected.applied).toBe(true);
    expect(collected.checkpoint.openedChestIds).toEqual(['secret-cache']);
    const duplicate = applyExpeditionCommand(plan, collected.checkpoint, { type: 'collect' }, read);
    expect(duplicate.applied).toBe(false);
    expect(duplicate.checkpoint).toBe(collected.checkpoint);
    checkpoint = structuredClone(collected.checkpoint);
    for (let i = 0; i < 13; i++) checkpoint = applyExpeditionCommand(plan, checkpoint, { type: 'move', direction: 'west' }, read).checkpoint;
    expect(applyExpeditionCommand(plan, checkpoint, { type: 'finish' }, read).checkpoint.phase).toBe('complete');
  });

  it('does not let plan exhaustion or a claimed phase fabricate completion', () => {
    const checkpoint = createExpeditionCheckpoint(plan, read);
    expect(applyExpeditionCommand(plan, { ...checkpoint, phase: 'returning' }, { type: 'finish' }, read).applied).toBe(false);
    const refused = applyExpeditionCommand(plan, checkpoint, { type: 'move', direction: 'north' }, read);
    expect(refused.applied).toBe(false);
    expect(refused.checkpoint.revision).toBe(0);
  });
});
