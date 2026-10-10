import { describe, expect, it } from 'vitest';
import { addressKey } from '../../expedition/address';
import { createDirectedFixture } from '../fixture';
import { projectDirectedMemory, recallDirectedDestination } from './index';
import { at, identity, memoryFixture, remembered } from './fixtures.test-support';

describe('bounded memory with growing learned topology', () => {
  it('retains current/near/distant scopes in the prepared fixture at the default budget', () => {
    const { session } = createDirectedFixture({ perceptionProfile: 'expert' });
    const { memory } = projectDirectedMemory(session.knowledge, session.actor.position, {
      worldId: session.knowledge.worldId, observerId: session.actor.id, floorId: 'F1',
    });
    expect(memory.currentRoom.roomId).toBe('H');
    expect(memory.currentRoom.cells.length).toBeGreaterThan(0);
    expect(memory.nearby.map(room => room.roomId)).toContain('W');
    expect(memory.distant.map(room => room.roomId)).toContain('L');
  });

  it('keeps a 306-cell learned map out of bounded context while allowing exact distant recall', () => {
    const knowledge = memoryFixture();
    knowledge.revision = 400;
    for (let index = 0; index < 300; index++) {
      const roomId = `remote-${String(index).padStart(3, '0')}`;
      const nextId = `remote-${String(index + 1).padStart(3, '0')}`;
      knowledge.spaces[roomId] = remembered({ id: roomId, name: `Remote room ${index}`, originX: 100 + index, originZ: 0, rows: 1, columns: 1 }, index + 100);
      knowledge.cells[addressKey(at(roomId))] = remembered({ address: at(roomId), exits: index < 299 ? { east: at(nextId) } : {} }, index + 100);
    }
    knowledge.cells[addressKey(at('S', 1))].value.exits.east = at('remote-000');
    knowledge.features.last = remembered({ id: 'last', name: 'Far chest', kind: 'chest', state: 'closed', position: at('remote-299') }, 399);
    const before = structuredClone(knowledge);
    const view = projectDirectedMemory(knowledge, at('S'), identity, { bytes: 8_000, cells: 2, rooms: 4 });
    expect(view.bytes).toBeLessThanOrEqual(8_000);
    expect(view.memory.currentRoom.cells).toHaveLength(2);
    expect(view.memory.nearby.length + view.memory.distant.length + 1).toBeLessThanOrEqual(4);
    expect(view.memory.omissions.rooms).toBeGreaterThan(300);
    expect(view.memory.omissions.cells).toBe(304);
    expect(view.json).not.toContain('Far chest');
    expect(view.json).not.toContain('remote-299');
    const recalled = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'feature', featureId: 'last' }, { bytes: 65_536 });
    expect(recalled.memory.feature).toMatchObject({ value: { name: 'Far chest' }, observedAt: 399, evidence: { status: 'stale' } });
    expect(recalled.memory.route).toMatchObject({ status: 'known-route', distance: 300, firstRouteDirection: 'east' });
    expect(recalled.memory.omissions.cells).toBe(306);
    expect(recalled.json).not.toContain('Remote room 0');
    expect(knowledge).toEqual(before);
  });

  it('retrieves omitted targets without broadening the overview or mutating earlier exact bytes', () => {
    const knowledge = memoryFixture();
    const view = projectDirectedMemory(knowledge, at('S'), identity, { rooms: 1 });
    const originalJson = view.json;
    expect(view.memory.distant).toEqual([]);
    const recall = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'feature', featureId: 'lever' });
    expect(recall.memory.feature!.value.id).toBe('lever');
    knowledge.features.lever = remembered({ ...knowledge.features.lever.value, state: 'active' }, 5);
    expect(recall.memory.feature!.value.state).toBe('idle');
    expect(recall.memory.feature!.observedAt).toBe(2);
    expect(view.json).toBe(originalJson);
    expect(projectDirectedMemory(knowledge, at('S'), identity, { rooms: 1 }).memory.distant).toEqual([]);
  });
});
