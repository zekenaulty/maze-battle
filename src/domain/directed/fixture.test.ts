import { describe, expect, it } from 'vitest';
import { addressKey } from '../expedition/address';
import { presentDirected } from './context';
import { createDirectedFixture, createDirectedWorld } from './fixture';
import { emptyDirectedKnowledge, rememberDirected } from './knowledge';
import { observeDirected } from './perception';
import { moveDirectedWorld } from './world';

describe('NS0 directed fixture', () => {
  it('builds fresh initial worlds without a prelude or aliases to other worlds and fixtures', () => {
    const initial = createDirectedWorld();
    const independent = createDirectedWorld();
    const expected = structuredClone(independent);
    const { session } = createDirectedFixture();
    expect(initial.revision).toBe(0);
    expect(initial).toEqual(independent);
    expect(createDirectedWorld({ hiddenTrap: false }).features.T).toBeUndefined();
    const key = addressKey({ spaceId: 'H', row: 0, column: 4 });
    initial.spaces.H.name = 'Changed';
    initial.cells[key].address.row = 4;
    initial.cells[key].exits.west!.column = 0;
    initial.features.T.state = 'active';
    expect(independent).toEqual(expected);
    expect(createDirectedWorld()).toEqual(expected);
    expect(session.world).toEqual({ ...expected, revision: 16 });
  });

  it('materializes only H, L and W with the agreed local addresses', () => {
    const { session } = createDirectedFixture();
    expect(Object.keys(session.world.spaces)).toEqual(['H', 'L', 'W']);
    expect(Object.keys(session.world.cells)).toHaveLength(53);
    expect(session.actor.position).toEqual({ spaceId: 'H', row: 2, column: 2 });
    expect(session.world.features.V.position).toEqual({ spaceId: 'L', row: 2, column: 2 });
    expect(session.world.features.D.position).toEqual({ spaceId: 'H', row: 2, column: 4 });
    expect(session.world.features.T.position).toEqual({ spaceId: 'W', row: 0, column: 1 });
    expect(Object.values(session.world.cells).filter(cell => cell.address.spaceId === 'W')
      .map(cell => cell.address)).toEqual([0, 1, 2].map(column => ({ spaceId: 'W', row: 0, column })));
    expect(session.world.cells[addressKey({ spaceId: 'H', row: 2, column: 0 })].exits.west)
      .toEqual({ spaceId: 'W', row: 0, column: 2 });
    expect(session.world.cells[addressKey({ spaceId: 'W', row: 0, column: 0 })].exits.west)
      .toEqual({ spaceId: 'L', row: 2, column: 4 });
  });

  it.each([false, true])('reconstructs the world and observation history from the initial world and events (hiddenTrap=%s)', hiddenTrap => {
    const { session, observations, events } = createDirectedFixture({ hiddenTrap });
    let world = createDirectedWorld({ hiddenTrap });
    let actor = { id: 'P1', position: { spaceId: 'H', row: 2, column: 2 } };
    let knowledge = emptyDirectedKnowledge(world.id, actor.id);
    expect(events).toHaveLength(16);
    expect(observations).toHaveLength(17);
    expect(observations[8].scene.position).toEqual({ spaceId: 'L', row: 2, column: 2 });
    for (let index = 0; index < observations.length; index++) {
      if (index > 0) {
        const moved = moveDirectedWorld(world, actor, events[index - 1].position!);
        expect(moved.event).toEqual(events[index - 1]);
        ({ world, actor } = moved);
      }
      const observation = observeDirected(world, actor, knowledge, 'prelude');
      expect(observation).toEqual(observations[index]);
      knowledge = rememberDirected(knowledge, observation);
    }
    expect(world).toEqual(session.world);
    expect(actor).toEqual(session.actor);
    expect(knowledge).toEqual(session.knowledge);
    expect(knowledge.revision).toBe(17);
    expect(session.revision).toBe(16);
    expect(session.world.features.V.state).toBe('idle');
    expect(session.world.features.D.state).toBe('locked');
    expect(knowledge.cells[addressKey({ spaceId: 'L', row: 0, column: 0 })]).toBeUndefined();
  });

  it('detects unjournaled final-world changes instead of importing them into the replay seed', () => {
    const { session, observations, events } = createDirectedFixture();
    const history = structuredClone({ observations, events });
    const key = addressKey({ spaceId: 'H', row: 0, column: 4 });
    delete session.world.cells[key].exits.west;
    session.world.features.T.state = 'active';
    let world = createDirectedWorld();
    let actor = { id: 'P1', position: { spaceId: 'H', row: 2, column: 2 } };
    for (const event of events) {
      const moved = moveDirectedWorld(world, actor, event.position!);
      expect(moved.event).toEqual(event);
      ({ world, actor } = moved);
    }
    expect(world).toEqual({ ...createDirectedWorld(), revision: events.length });
    expect(world).not.toEqual(session.world);
    expect(world.cells[key].exits.west).toEqual({ spaceId: 'H', row: 0, column: 3 });
    expect(world.features.T.state).toBe('idle');
    expect({ observations, events }).toEqual(history);
  });

  it('has identical actor evidence and exact contexts with and without the non-triggering hidden trap', () => {
    const withTrap = createDirectedFixture({ hiddenTrap: true });
    const withoutTrap = createDirectedFixture({ hiddenTrap: false });
    expect(withTrap.session.world.features.T).toBeDefined();
    expect(withoutTrap.session.world.features.T).toBeUndefined();
    expect(withTrap.observations).toEqual(withoutTrap.observations);
    expect(withTrap.events).toEqual(withoutTrap.events);
    expect(withTrap.session.knowledge).toEqual(withoutTrap.session.knowledge);
    expect(presentDirected(withTrap.session, 'context', 'decision-fixture'))
      .toEqual(presentDirected(withoutTrap.session, 'context', 'decision-fixture'));
  });
});
