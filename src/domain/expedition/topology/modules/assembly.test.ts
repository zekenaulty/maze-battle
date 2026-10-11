import { describe, expect, it } from 'vitest';
import { movePosition, opposite } from '../../../maze/movement';
import { overlaps, spaceBounds, world } from '../geometry';
import { ModuleAssembly } from './assembly';
import { createModuleRecipe } from './policy';
import { assertModuleQuality, moduleQuality } from './quality';

const seeds = [1, 7, 42, 1337, 20261011, 0xffffffff];
const budgets = [7, 11, 13, 16, 32, 64, 128, 256];

describe('D1 socket module assembly', () => {
  it.each(budgets)('qualifies branching, bounded exact geometry at %i modules across six seeds', budget => {
    for (const seed of seeds) {
      const recipe = { ...createModuleRecipe('test-world', 1, seed), roomBudget: budget };
      const builder = new ModuleAssembly(recipe);
      const state = builder.finish();
      const quality = assertModuleQuality(state);
      expect(quality.rooms).toBe(budget);
      expect(quality.projectionCells).toBeLessThanOrEqual(65_536);
      expect(quality.coverage).toBeGreaterThan(0.25);
      expect(quality.directJoins).toBeGreaterThan(0);
      expect(state.pending).toHaveLength(0);
      expect(new Set(state.spaces.map(space => space.id)).size).toBe(state.spaces.length);
      expect(new Set(state.connections.map(link => link.id)).size).toBe(state.connections.length);
      for (const [index, space] of state.spaces.entries()) {
        for (const other of state.spaces.slice(index + 1)) expect(overlaps(spaceBounds(space), spaceBounds(other))).toBe(false);
        expect(space.chests).toEqual([]);
        if (space.kind === 'room') {
          expect(space.rows).toBeGreaterThanOrEqual(5);
          expect(space.rows).toBeLessThanOrEqual(15);
          expect(space.columns).toBeGreaterThanOrEqual(5);
          expect(space.columns).toBeLessThanOrEqual(15);
        } else expect(Math.max(space.rows, space.columns)).toBeLessThanOrEqual(7);
      }
      const spaces = new Map(state.spaces.map(space => [space.id, space]));
      const ports = new Set<string>();
      for (const link of state.connections) {
        expect(movePosition(world(spaces.get(link.from.spaceId)!, link.from), link.direction))
          .toEqual(world(spaces.get(link.to.spaceId)!, link.to));
        for (const [port, direction] of [[link.from, link.direction], [link.to, opposite(link.direction)]] as const) {
          const key = `${port.spaceId}:${port.row}:${port.column}:${direction}`;
          expect(ports.has(key)).toBe(false);
          ports.add(key);
        }
      }
      expect(builder.work.candidates).toBeLessThanOrEqual(4 * budget * recipe.policy.attempts);
      expect(builder.work.index.bucketReads).toBeLessThanOrEqual(builder.work.index.queries * 9);
    }
  }, 30_000);

  it.each(['direct', 'passage', 'mixed'] as const)('supports %s joins and deterministic incremental/eager agreement', joins => {
    const base = createModuleRecipe('test-world', 5, 42);
    const recipe = { ...base, policy: { ...base.policy, joins } };
    const first = new ModuleAssembly(recipe);
    const second = new ModuleAssembly(recipe);
    while (!second.complete) {
      const before = second.snapshot();
      const proposal = second.propose(before.revision, `different-scheduler-${before.revision}`)!;
      // Observation/prefetch order cannot select another frontier or leak mutations.
      second.snapshot().spaces.reverse();
      expect(second.snapshot()).toEqual(before);
      second.commit(proposal);
    }
    expect(second.snapshot()).toEqual(first.finish());
    const quality = moduleQuality(second.snapshot());
    if (joins === 'direct') expect(quality.passages).toBe(0);
    if (joins === 'passage') expect(quality.directJoins).toBe(0);
    if (joins === 'mixed') expect(quality.directJoins * quality.passages).toBeGreaterThan(0);
  });

  it('rejects over-budget work before allocating a floor or mutating its caller recipe', () => {
    const recipe = createModuleRecipe('world', 200, 42);
    const saved = structuredClone(recipe);
    expect(() => new ModuleAssembly(recipe)).toThrow(/406.*256/);
    expect(recipe).toEqual(saved);
  });

  it('retains atomic socket custody, exact replay and stale/forged proposal rejection', () => {
    const builder = new ModuleAssembly(createModuleRecipe('world', 1, 42));
    const before = builder.snapshot();
    const proposal = builder.propose(0, 'one')!;
    const other = builder.propose(0, 'two')!;
    expect(builder.snapshot()).toEqual(before);
    const corrupt = structuredClone(proposal);
    corrupt.connections.pop();
    expect(() => builder.commit(corrupt)).toThrow(/Invalid module proposal/);
    expect(builder.snapshot()).toEqual(before);
    expect(builder.commit(proposal)).toEqual({ status: 'applied', revision: 1 });
    expect(builder.commit(proposal)).toEqual({ status: 'duplicate', revision: 1 });
    expect(builder.commit(other).status).toBe('conflict');
    expect(() => builder.commit(corrupt)).toThrow(/reused/);
    expect(() => builder.propose(0, 'stale')).toThrow(/Stale/);
    expect(builder.snapshot().rooms).toBe(2);
  });
});
