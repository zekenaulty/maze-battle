import { describe, expect, it } from 'vitest';
import { addressKey } from '../../expedition/address';
import { createDirectedFixture } from '../fixture';
import { planKnownDestination } from '../navigation';
import { recallDirectedDestination } from './index';
import { at, freeze, identity, memoryFixture, remembered } from './fixtures.test-support';

describe('exact bounded destination recall', () => {
  it('recalls a distant feature and examination without dumping other rooms or refreshing evidence', () => {
    const knowledge = memoryFixture();
    knowledge.examinations = { lever: remembered({ featureId: 'lever', detail: 'Old inscription.' }) };
    const before = structuredClone(knowledge);
    const { memory, json } = recallDirectedDestination(freeze(knowledge), at('S'), identity, { kind: 'feature', featureId: 'lever' });
    expect(memory.status).toBe('known');
    expect(memory.feature).toMatchObject({ value: { name: 'Distant lever', state: 'idle' }, observedAt: 2,
      observationId: 'observation-2', evidence: { status: 'stale', sourceIds: ['observation-2'] } });
    expect(memory.examination).toMatchObject({ value: { detail: 'Old inscription.' }, observedAt: 2 });
    expect(memory.geographicBearing.direction).toBe('west');
    expect(memory.route).toMatchObject({ status: 'known-route', firstRouteDirection: 'north', distance: 2 });
    expect(memory).not.toHaveProperty('cells');
    expect(memory).not.toHaveProperty('connections');
    expect(memory).not.toHaveProperty('nearby');
    expect(memory.omissions).toMatchObject({ rooms: 4, cells: 6, features: 1, examinations: 0, connections: 6 });
    expect(json).not.toMatch(/Local chest|Room N|Room M|Room U/);
    expect(knowledge).toEqual(before);
    memory.feature!.value.state = 'active';
    expect(knowledge).toEqual(before);
  });

  it('uses the existing actor pathfinder and preserves adjacent versus occupy arrival', () => {
    const knowledge = memoryFixture();
    const target = { kind: 'feature' as const, featureId: 'lever', arrival: 'adjacent' as const };
    const existing = planKnownDestination(knowledge, at('S'), target);
    const feature = recallDirectedDestination(knowledge, at('S'), identity, target).memory;
    const cell = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'cell', address: at('D') }).memory;
    expect(existing.status).toBe('ready');
    if (existing.status === 'ready') expect(feature.route).toMatchObject({ distance: existing.distance });
    expect(cell.route).toMatchObject({ status: 'known-route', distance: 3 });
    expect(cell.cell!.value.address).toEqual(at('D'));
    expect(cell.omissions.cells).toBe(5);
    expect(cell.feature).toBeUndefined();
    expect(recallDirectedDestination(knowledge, at('D'), identity, { kind: 'cell', address: at('D') }).memory.route)
      .toMatchObject({ status: 'known-route', distance: 0, firstRouteDirection: null });
  });

  it('returns only a compact room summary for an exact room lookup', () => {
    const { memory } = recallDirectedDestination(memoryFixture(), at('S'), identity, { kind: 'room', roomId: 'D' });
    expect(memory).toMatchObject({ status: 'known', room: { roomId: 'D', detail: 'summary-only', knownCells: 1, knownFeatures: 1 },
      omissions: { cells: 6, features: 2 } });
    expect(memory.cell).toBeUndefined();
    expect(memory.feature).toBeUndefined();
  });

  it('matches the existing navigator on equal-distance feature approaches with mixed-case IDs', () => {
    const knowledge = memoryFixture();
    knowledge.cells = {};
    knowledge.features = { goal: remembered({ id: 'goal', kind: 'lever', name: 'Goal', state: 'idle', position: at('T') }) };
    for (const cell of [
      { address: at('S'), exits: { north: at('Z'), east: at('a') } },
      { address: at('Z'), exits: { north: at('T') } },
      { address: at('a'), exits: { north: at('T') } },
      { address: at('T'), exits: {} },
    ]) knowledge.cells[addressKey(cell.address)] = remembered(cell);
    const plan = planKnownDestination(knowledge, at('S'), { kind: 'feature', featureId: 'goal', arrival: 'adjacent' });
    const { memory } = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'feature', featureId: 'goal' });
    expect(plan.status).toBe('ready');
    if (plan.status === 'ready') {
      const direction = Object.entries(knowledge.cells[addressKey(at('S'))].value.exits)
        .find(([, to]) => addressKey(to) === addressKey(plan.route[0]))![0];
      expect(memory.route).toMatchObject({ distance: plan.distance, firstRouteDirection: direction });
    }
  });

  it('copies only the requested exact target fields, never attached host objects', () => {
    const target = { kind: 'feature' as const, featureId: 'lever', world: { private: 'HOST-SECRET' } };
    Object.defineProperty(target, 'world', { get: () => { throw new Error('Host access forbidden'); } });
    const result = recallDirectedDestination(memoryFixture(), at('S'), identity, target);
    expect(result.memory.target).toEqual({ kind: 'feature', featureId: 'lever' });
    expect(result.json).not.toContain('HOST-SECRET');
  });

  it.each(['unknown', 'Distant lever', '__proto__', 'constructor', 'toString'])('does not fuzzy-match or inherit unknown ID %s', featureId => {
    const { memory } = recallDirectedDestination(memoryFixture(), at('S'), identity, { kind: 'feature', featureId });
    expect(memory.status).toBe('unknown');
    expect(memory.route).toEqual({ status: 'unknown', reason: 'destination-not-remembered' });
    expect(memory.sourceIds).toEqual([]);
    expect(memory.feature).toBeUndefined();
  });

  it('distinguishes observed absence from unknown and preserves prior examination as historical', () => {
    const knowledge = memoryFixture();
    delete knowledge.features.lever;
    knowledge.absent.lever = { observationId: 'observation-5', observedAt: 5 };
    knowledge.examinations = { lever: remembered({ featureId: 'lever', detail: 'Old inscription.' }) };
    const { memory } = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'feature', featureId: 'lever' });
    expect(memory).toMatchObject({ status: 'absent', absence: { value: { featureId: 'lever' }, observationId: 'observation-5' },
      examination: { evidence: { status: 'stale' } }, route: { status: 'unknown', reason: 'destination-not-remembered' } });
    expect(memory.feature).toBeUndefined();
    expect(memory.room).toBeUndefined();
    expect(memory.omissions.absent).toBe(0);
  });

  it('does not turn an orphan examination into a known destination', () => {
    const knowledge = memoryFixture();
    knowledge.examinations = { orphan: remembered({ featureId: 'orphan', detail: 'Old detail' }) };
    const { memory } = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'feature', featureId: 'orphan' });
    expect(memory.status).toBe('unknown');
    expect(memory.examination).toBeUndefined();
    expect(memory.omissions.examinations).toBe(1);
  });

  it('distinguishes disconnected memory and an unobserved destination cell', () => {
    const knowledge = memoryFixture();
    const inaccessible = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'cell', address: at('U') });
    expect(inaccessible.memory).toMatchObject({ status: 'known', route: { status: 'inaccessible', reason: 'no-known-route' } });
    const unknown = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'cell', address: at('D', 9) });
    expect(unknown.memory.status).toBe('unknown');
    expect(unknown.memory.cell).toBeUndefined();
    delete knowledge.spaces.D;
    const unlocated = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'cell', address: at('D') });
    expect(unlocated.memory.geographicBearing.direction).toBe('unknown');
    expect(unlocated.memory.route.status).toBe('known-route');
  });

  it('keeps learned blocking until knowledge changes, irrespective of unseen truth', () => {
    const { session } = createDirectedFixture();
    const ids = { worldId: session.knowledge.worldId, observerId: session.actor.id, floorId: 'F1' };
    const target = { kind: 'feature' as const, featureId: 'V' };
    const original = recallDirectedDestination(session.knowledge, session.actor.position, ids, target);
    session.world.features.V.state = 'active';
    delete session.world.features.V;
    Object.defineProperty(session, 'world', { get: () => { throw new Error('World access forbidden'); } });
    expect(recallDirectedDestination(session.knowledge, session.actor.position, ids, target)).toEqual(original);
    const knowledge = memoryFixture();
    knowledge.features.gate = remembered({ id: 'gate', name: 'Learned gate', kind: 'door', state: 'locked', position: at('N') });
    expect(recallDirectedDestination(knowledge, at('S'), identity, { kind: 'cell', address: at('D') }).memory.route.status).toBe('inaccessible');
    knowledge.features.gate.value.state = 'open';
    expect(recallDirectedDestination(knowledge, at('S'), identity, { kind: 'cell', address: at('D') }).memory.route.status).toBe('known-route');
  });

  it('fails closed instead of fabricating routing when remembered graph exceeds its search budget', () => {
    const knowledge = memoryFixture();
    const before = structuredClone(knowledge);
    expect(() => recallDirectedDestination(knowledge, at('S'), identity, { kind: 'cell', address: at('D') }, { searchCells: 5 }))
      .toThrow('search budget');
    expect(knowledge).toEqual(before);
    knowledge.blockedEdges = { [`${addressKey(at('S'))}>${addressKey(at('N'))}`]: remembered({ from: at('S'), to: at('N') }) };
    expect(recallDirectedDestination(knowledge, at('S'), identity, { kind: 'cell', address: at('D') }).memory.route.status).toBe('inaccessible');
  });
});
