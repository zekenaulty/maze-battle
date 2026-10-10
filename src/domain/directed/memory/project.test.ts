import { describe, expect, it } from 'vitest';
import { addressKey } from '../../expedition/address';
import { createDirectedFixture } from '../fixture';
import { applyDirectedCommand } from '../transition';
import { projectDirectedMemory } from './index';
import { at, freeze, identity, memoryFixture, remembered } from './fixtures.test-support';

describe('bounded actor memory overview', () => {
  it('details only the current room, gives nearby connections and compact distant summaries', () => {
    const knowledge = memoryFixture();
    const { memory, json, bytes } = projectDirectedMemory(knowledge, at('S'), identity);
    expect(memory.currentRoom.cells).toHaveLength(2);
    expect(memory.currentRoom.features.map(entry => entry.value.id)).toEqual(['local']);
    expect(memory.nearby.map(room => room.roomId)).toEqual(['N']);
    expect(memory.distant.map(room => room.roomId)).toEqual(['D', 'M', 'U']);
    expect(memory.connections.map(edge => [edge.from.spaceId, edge.to.spaceId])).toEqual([['N', 'S'], ['S', 'N']]);
    expect(memory.distant.find(room => room.roomId === 'D')).toMatchObject({
      detail: 'summary-only', knownCells: 1, knownFeatures: 1,
      geographicBearing: { direction: 'west' }, route: { status: 'known-route', distance: 3, firstRouteDirection: 'north' },
    });
    expect(memory.distant.find(room => room.roomId === 'U')!.route).toMatchObject({ status: 'inaccessible', reason: 'no-known-route' });
    expect(memory.omissions).toMatchObject({ cells: 4, features: 1, rooms: 0, connections: 4 });
    expect(json).not.toContain('Distant lever');
    expect(JSON.parse(json)).toEqual(memory);
    expect(bytes).toBe(new TextEncoder().encode(json).byteLength);
  });

  it('does not read host truth or refresh old facts, and emits detached data', () => {
    const fixture = createDirectedFixture();
    const { knowledge, actor } = fixture.session;
    const ids = { worldId: knowledge.worldId, observerId: actor.id, floorId: 'F1' };
    const before = structuredClone(knowledge);
    const original = projectDirectedMemory(freeze(knowledge), actor.position, ids);
    fixture.session.world.features.V.state = 'active';
    fixture.session.world.features.secret = { ...fixture.session.world.features.V, id: 'secret', name: 'SECRET WORLD', hidden: true };
    Object.defineProperty(fixture.session, 'world', { get: () => { throw new Error('World access forbidden'); } });
    expect(projectDirectedMemory(knowledge, actor.position, ids)).toEqual(original);
    expect(knowledge).toEqual(before);
    expect(original.json).not.toMatch(/SECRET WORLD|Hidden Trap|sourceWorldRevision|hidden/);
    original.memory.currentRoom.cells[0].value.exits = {};
    expect(knowledge).toEqual(before);
  });

  it('preserves optional NS-3 evidence without relocating cues or dumping inspection coverage', () => {
    const knowledge = memoryFixture();
    knowledge.perception = remembered({ profileId: 'expert', effectiveValue: 3, conditions: 'clear' });
    knowledge.cues = remembered([{ kind: 'suspicious', direction: 'west', message: 'Something seems unusual nearby.' }]);
    knowledge.examinations = { local: remembered({ featureId: 'local', detail: 'A painted chest.' }),
      lever: remembered({ featureId: 'lever', detail: 'A distant engraving.' }) };
    knowledge.inspection = remembered({ attemptId: 'inspect-1', direction: 'west', viewpoint: at('D'),
      coveredCells: [at('M')], depth: 'detail', limitation: 'adjacent-cell-only' });
    const { memory, json } = projectDirectedMemory(knowledge, at('S'), identity);
    expect(memory.cues).toMatchObject({ frame: 'source-observation-only', fact: {
      observedAt: 2, observationId: 'observation-2', evidence: { status: 'stale' }, value: [{ direction: 'west' }],
    } });
    expect(memory.currentRoom.examinations.map(entry => entry.value.featureId)).toEqual(['local']);
    expect(memory.inspection!.value).toMatchObject({ viewpoint: at('D'), coverageDetail: 'omitted', coveredCellCount: 1 });
    expect(memory.inspection!.value).not.toHaveProperty('coveredCells');
    expect(memory.omissions.examinations).toBe(1);
    expect(json).not.toContain('A distant engraving.');
    expect(memory.sourceIds).toEqual(['observation-2', 'observation-5']);
  });

  it('projects real NS-3 inspection receipts, not a synthetic disclosure upgrade', () => {
    const { session } = createDirectedFixture({ perceptionProfile: 'expert' });
    const inspected = applyDirectedCommand(session, { type: 'inspect', direction: 'here' }, 1, 'memory-inspection').session;
    const { knowledge, actor } = inspected;
    const { memory } = projectDirectedMemory(knowledge, actor.position, {
      worldId: knowledge.worldId, observerId: actor.id, floorId: 'F1',
    });
    expect(memory.perception!.value).toEqual(knowledge.perception!.value);
    expect(memory.inspection!.observationId).toBe(knowledge.inspection!.observationId);
    expect(memory.inspection!.value.viewpoint).toEqual(actor.position);
  });

  it('keeps blocked connections near while reporting only learned inaccessibility', () => {
    const knowledge = memoryFixture();
    knowledge.blockedEdges = { [`${addressKey(at('S'))}>${addressKey(at('N'))}`]: remembered({ from: at('S'), to: at('N') }, 5) };
    const { memory } = projectDirectedMemory(knowledge, at('S'), identity);
    expect(memory.nearby[0]).toMatchObject({ roomId: 'N', route: { status: 'inaccessible', reason: 'no-known-route' } });
    expect(memory.connections.find(edge => edge.from.spaceId === 'S')).toMatchObject({ status: 'remembered-blocked',
      evidence: { sourceIds: ['observation-2', 'observation-5'] } });
    expect(memory.currentRoom.blockedEdges).toHaveLength(1);
  });

  it('does not infer missing cells from room metadata or claim unseen origin routes', () => {
    const knowledge = memoryFixture();
    knowledge.spaces.metadataOnly = remembered({ id: 'metadataOnly', name: 'Known boundary', originX: 20, originZ: 20, rows: 200, columns: 200 });
    const { memory } = projectDirectedMemory(knowledge, at('S'), identity);
    expect(memory.distant.find(room => room.roomId === 'metadataOnly')).toMatchObject({ knownCells: 0,
      route: { status: 'unknown', reason: 'destination-not-remembered' } });
    const unknown = projectDirectedMemory(knowledge, at('unseen'), identity).memory;
    expect(unknown.currentRoom).toMatchObject({ status: 'unknown', cells: [], features: [] });
    expect([...unknown.nearby, ...unknown.distant].every(room => room.route.status === 'unknown')).toBe(true);
  });

  it('keeps bytes stable across record insertion order and repeated reads', () => {
    const knowledge = memoryFixture();
    const original = projectDirectedMemory(knowledge, at('S'), identity);
    for (const key of ['spaces', 'cells', 'features', 'absent'] as const) {
      Object.assign(knowledge, { [key]: Object.fromEntries(Object.entries(knowledge[key]).reverse()) });
    }
    expect(projectDirectedMemory(knowledge, at('S'), identity)).toEqual(original);
  });
});
