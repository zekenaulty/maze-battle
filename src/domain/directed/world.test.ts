import { describe, expect, it } from 'vitest';
import { addressKey } from '../expedition/address';
import { createDirectedFixture } from './fixture';
import { canTraverseDirected, interactDirectedWorld, moveDirectedWorld } from './world';

describe('directed world effects', () => {
  it.each(['closed', 'locked', 'open'] as const)('respects a %s destination door without rewriting geometry', state => {
    const { session: { world, actor } } = createDirectedFixture();
    world.features.D.state = state;
    actor.position.column = 3;
    const door = world.features.D.position;
    const before = structuredClone(world);
    expect(canTraverseDirected(world, actor.position, door)).toBe(state === 'open');
    expect(world.cells[addressKey(actor.position)].exits.east).toEqual(door);
    expect(world).toEqual(before);
    if (state !== 'open') expect(() => moveDirectedWorld(world, actor, door)).toThrow('Illegal');
    else expect(moveDirectedWorld(world, actor, door).actor.position).toEqual(door);
  });

  it('requires a real geometric edge and a real destination, not proximity or an arbitrary target', () => {
    const { session: { world, actor } } = createDirectedFixture();
    const next = { ...actor.position, column: 3 };
    expect(canTraverseDirected(world, actor.position, next)).toBe(true);
    expect(canTraverseDirected(world, actor.position, actor.position)).toBe(false);
    expect(canTraverseDirected(world, actor.position, world.features.V.position)).toBe(false);
    expect(canTraverseDirected(world, { ...actor.position, spaceId: 'missing' }, next)).toBe(false);
    delete world.cells[addressKey(actor.position)].exits.east;
    expect(() => moveDirectedWorld(world, actor, next)).toThrow('Illegal');
    world.cells[addressKey(actor.position)].exits.east = next;
    delete world.cells[addressKey(next)];
    expect(() => moveDirectedWorld(world, actor, next)).toThrow('Illegal');
  });

  it('uses canonical blockage even for a hidden door, and checks only the destination', () => {
    const { session: { world, actor } } = createDirectedFixture();
    world.features.D.hidden = true;
    actor.position.column = 3;
    expect(canTraverseDirected(world, actor.position, world.features.D.position)).toBe(false);
    expect(canTraverseDirected(world, world.features.D.position, actor.position)).toBe(true);
  });

  it('returns a detached movement event and state without altering actor, world or destination history', () => {
    const { session: { world, actor } } = createDirectedFixture();
    const before = structuredClone({ world, actor });
    const to = { ...actor.position, column: 3 };
    const result = moveDirectedWorld(world, actor, to);
    expect({ world, actor }).toEqual(before);
    expect(result.event).toEqual({
      id: 'W1:event:17', revision: 17, type: 'move', subjectId: 'P1', position: to,
      before: addressKey(actor.position), after: addressKey(to),
    });
    result.actor.position.column = 0;
    result.world.cells[addressKey(to)].address.column = 0;
    to.column = 1;
    expect(result.event.position!.column).toBe(3);
    expect({ world, actor }).toEqual(before);
  });

  it.each([2, 3])('activates a lever from local column %i without changing any remote feature', column => {
    const { session: { world, actor } } = createDirectedFixture();
    actor.position = { spaceId: 'L', row: 2, column };
    const before = structuredClone(world);
    const result = interactDirectedWorld(world, actor, 'V');
    expect(world).toEqual(before);
    expect(result.world.features.V.state).toBe('active');
    expect(result.world.features.D).toEqual(world.features.D);
    expect(result.world.features.T).toEqual(world.features.T);
    expect(result.event).toMatchObject({ revision: 17, type: 'interact', subjectId: 'V', before: 'idle', after: 'active' });
    expect(() => interactDirectedWorld(result.world, actor, 'V')).toThrow('Unsupported');
    result.world.features.V.position.column = 0;
    expect(result.event.position).toEqual(before.features.V.position);
    expect(world).toEqual(before);
  });

  it('opens a closed local chest once, but never unlocks one', () => {
    const { session: { world, actor } } = createDirectedFixture();
    world.features.C = { id: 'C', kind: 'chest', name: 'Chest', position: { ...actor.position, column: 3 }, state: 'closed' };
    const result = interactDirectedWorld(world, actor, 'C');
    expect(result.world.features.C.state).toBe('open');
    expect(world.features.C.state).toBe('closed');
    expect(() => interactDirectedWorld(result.world, actor, 'C')).toThrow('Unsupported');
    world.features.C.state = 'locked';
    expect(() => interactDirectedWorld(world, actor, 'C')).toThrow('Unsupported');
  });

  it('refuses hidden, remote, unsupported and disconnected interactions', () => {
    const { session: { world, actor } } = createDirectedFixture();
    expect(() => interactDirectedWorld(world, actor, 'V')).toThrow('local interaction');
    expect(() => interactDirectedWorld(world, actor, 'missing')).toThrow('local interaction');
    actor.position = { ...world.features.T.position };
    expect(() => interactDirectedWorld(world, actor, 'T')).toThrow('local interaction');
    actor.position = { ...world.features.D.position };
    expect(() => interactDirectedWorld(world, actor, 'D')).toThrow('Unsupported');
    actor.position = { spaceId: 'L', row: 2, column: 3 };
    delete world.cells[addressKey(actor.position)].exits.west;
    expect(() => interactDirectedWorld(world, actor, 'V')).toThrow('local interaction');
  });
});
