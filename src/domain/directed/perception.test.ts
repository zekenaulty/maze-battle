import { describe, expect, it } from 'vitest';
import { addressKey } from '../expedition/address';
import { createDirectedFixture } from './fixture';
import { emptyDirectedKnowledge } from './knowledge';
import { observeDirected } from './perception';

describe('fixture visibility v1', () => {
  it('observes radius-two connected cells, including the blocking door but not host metadata', () => {
    const { session: { world, actor } } = createDirectedFixture();
    Object.assign(world.cells[addressKey(actor.position)], { secret: 'host-cell' });
    Object.assign(world.spaces.H, { secret: 'host-space' });
    Object.assign(world.features.D, { secret: 'host-feature' });
    const before = structuredClone({ world, actor });
    const observation = observeDirected(world, actor, emptyDirectedKnowledge('W1', 'P1'), 'look');
    expect(observation.coverage).toEqual({ radius: 2, basis: 'connected-cells', complete: true });
    expect(observation.sourceWorldRevision).toBe(world.revision);
    expect(observation.scene.cells).toHaveLength(13);
    for (const { address } of observation.scene.cells) {
      expect(Math.abs(address.row - 2) + Math.abs(address.column - 2)).toBeLessThanOrEqual(2);
    }
    expect(observation.scene.features).toEqual([{
      id: 'D', kind: 'door', name: 'Locked Door', position: world.features.D.position, state: 'locked',
    }]);
    expect(observation.scene.cells.find(cell => cell.address.row === 2 && cell.address.column === 3)!.exits.east).toBeUndefined();
    expect(observation.scene.spaces.map(space => space.id)).toEqual(['H']);
    expect(observation.scene.absentFeatureIds).toEqual([]);
    expect(JSON.stringify(observation.scene)).not.toMatch(/revision|sourceWorld|hidden|secret|host-|Hidden Trap/);
    expect({ world, actor }).toEqual(before);
    world.cells[addressKey(actor.position)].exits.north!.row = 4;
    world.features.D.state = 'open';
    actor.position.row = 0;
    expect(observation.scene.position.row).toBe(2);
    expect(observation.scene.cells[0].exits.north!.row).toBe(1);
    expect(observation.scene.features[0].state).toBe('locked');
  });

  it('does not observe geometrically nearby disconnected cells', () => {
    const { session: { world, actor } } = createDirectedFixture();
    world.cells[addressKey(actor.position)].exits = {};
    const observation = observeDirected(world, actor, emptyDirectedKnowledge('W1', 'P1'), 'look');
    expect(observation.scene.cells.map(cell => cell.address)).toEqual([actor.position]);
    expect(observation.scene.features).toEqual([]);
  });

  it.each([false, true])('does not peek at a remote door on a boundary edge (hidden=%s)', hidden => {
    const { session: { world, actor } } = createDirectedFixture();
    actor.position.column = 1;
    world.features.D.hidden = hidden;
    const knowledge = emptyDirectedKnowledge('W1', 'P1');
    const closed = observeDirected(world, actor, knowledge, 'look');
    world.features.D.state = 'open';
    const open = observeDirected(world, actor, knowledge, 'look');
    delete world.features.D;
    const absent = observeDirected(world, actor, knowledge, 'look');
    expect(closed.scene).toEqual(open.scene);
    expect(closed.scene).toEqual(absent.scene);
    const boundary = closed.scene.cells.find(cell => cell.address.row === 2 && cell.address.column === 3)!;
    expect(boundary.exits.east).toEqual({ spaceId: 'H', row: 2, column: 4 });
    expect(closed.scene.features).toEqual([]);
  });

  it('does not disclose even a nearby hidden door via incident links or coverage', () => {
    const { session: { world, actor } } = createDirectedFixture();
    actor.position.column = 3;
    world.features.D.hidden = true;
    const knowledge = emptyDirectedKnowledge('W1', 'P1');
    const hidden = observeDirected(world, actor, knowledge, 'look');
    delete world.features.D;
    expect(observeDirected(world, actor, knowledge, 'look').scene).toEqual(hidden.scene);
    expect(hidden.scene.cells[0].exits.east).toEqual({ spaceId: 'H', row: 2, column: 4 });
  });

  it('includes a visible closed doorway without expanding perception through it', () => {
    const { session: { world, actor } } = createDirectedFixture();
    actor.position = { spaceId: 'W', row: 0, column: 0 };
    world.features.D.position = { spaceId: 'W', row: 0, column: 1 };
    const observation = observeDirected(world, actor, emptyDirectedKnowledge('W1', 'P1'), 'look');
    expect(observation.scene.features.map(feature => feature.id)).toEqual(['D']);
    expect(observation.scene.cells.some(cell => cell.address.spaceId === 'W' && cell.address.column === 2)).toBe(false);
    expect(observation.scene.cells[0].exits.east).toBeUndefined();
    expect(world.cells[addressKey(actor.position)].exits.east).toEqual(world.features.D.position);
  });

  it('refuses an observer or world mismatch and an unavailable observer cell', () => {
    const { session: { world, actor, knowledge } } = createDirectedFixture();
    expect(() => observeDirected(world, { ...actor, id: 'P2' }, knowledge, 'look')).toThrow('mismatch');
    expect(() => observeDirected({ ...world, id: 'W2' }, actor, knowledge, 'look')).toThrow('mismatch');
    expect(() => observeDirected(world, { ...actor, position: { ...actor.position, spaceId: 'A' } }, knowledge, 'look'))
      .toThrow('unavailable');
  });
});
