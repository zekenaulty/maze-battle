import { describe, expect, it } from 'vitest';
import type { KnowledgeProjection } from '../types';
import { DEFAULT_MEMORY_BOUNDS, MAX_MEMORY_BOUNDS, projectDirectedMemory, recallDirectedDestination } from './index';
import type { MemoryBounds } from './index';
import { at, identity, memoryFixture, remembered } from './fixtures.test-support';

const overview = (knowledge = memoryFixture(), bounds?: Partial<MemoryBounds>) => projectDirectedMemory(knowledge, at('S'), identity, bounds);
describe('memory budgets and provenance', () => {
  it.each(Object.keys(DEFAULT_MEMORY_BOUNDS) as (keyof MemoryBounds)[])('rejects malformed %s bounds in both APIs', key => {
    for (const value of [undefined, null, NaN, Infinity, -1, 0.5, '4', MAX_MEMORY_BOUNDS[key] + 1]) {
      const bounds = { [key]: value } as Partial<MemoryBounds>;
      expect(() => overview(memoryFixture(), bounds)).toThrow('bound');
      expect(() => recallDirectedDestination(memoryFixture(), at('S'), identity, { kind: 'room', roomId: 'D' }, bounds)).toThrow('bound');
    }
    if (key !== 'nearHops') expect(() => overview(memoryFixture(), { [key]: 0 })).toThrow('bound');
  });

  it.each([null, [], 3, { surprise: 1 }, new Date(0), Object.create({ cells: 0 }), { [Symbol('cells')]: 1 }])('rejects an invalid bounds object %j', bounds => {
    expect(() => overview(memoryFixture(), bounds as Partial<MemoryBounds>)).toThrow('bounds');
  });

  it('enforces detailed cell, room, supplemental fact and connection limits with omissions', () => {
    const knowledge = memoryFixture();
    const { memory } = overview(knowledge, { cells: 1, rooms: 2, facts: 1, connections: 1 });
    expect(memory.currentRoom.cells).toHaveLength(1);
    expect(memory.currentRoom.cells[0].value.address).toEqual(at('S'));
    expect(memory.currentRoom.features).toEqual([]);
    expect(memory.nearby).toHaveLength(1);
    expect(memory.distant).toEqual([]);
    expect(memory.connections).toHaveLength(1);
    expect(memory.omissions).toMatchObject({ cells: 5, rooms: 3, features: 2, connections: 5,
      causes: { cells: true, rooms: true, facts: true, connections: true } });
    expect(overview(knowledge, { nearHops: 0 }).memory.nearby).toEqual([]);
  });

  it('omits oversized optional facts atomically and records byte pressure', () => {
    const knowledge = memoryFixture();
    knowledge.features.local.value.name = 'x'.repeat(65_536);
    const { memory, json, bytes } = overview(knowledge, { bytes: 4_000 });
    expect(bytes).toBeLessThanOrEqual(4_000);
    expect(JSON.parse(json)).toEqual(memory);
    expect(memory.currentRoom.features).toEqual([]);
    expect(memory.omissions.features).toBe(2);
    expect(memory.omissions.causes.bytes).toBe(true);
  });

  it('refuses an exact result or essential envelope that cannot fit instead of partial JSON', () => {
    expect(() => overview(memoryFixture(), { bytes: 1 })).toThrow('byte budget');
    const knowledge = memoryFixture();
    knowledge.features.lever.value.name = 'x'.repeat(65_536);
    expect(() => recallDirectedDestination(knowledge, at('S'), identity, { kind: 'feature', featureId: 'lever' })).toThrow('byte budget');
  });

  it('accepts the exact UTF-8 cap and rejects one byte less for required distant recall', () => {
    const knowledge = memoryFixture();
    knowledge.features.lever.value.name = '\u00e9'.repeat(100);
    const target = { kind: 'feature' as const, featureId: 'lever' };
    let cap = 16_384;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = recallDirectedDestination(knowledge, at('S'), identity, target, { bytes: cap });
      cap = result.bytes;
    }
    const exact = recallDirectedDestination(knowledge, at('S'), identity, target, { bytes: cap });
    expect(exact.bytes).toBe(cap);
    expect(exact.bytes).toBeGreaterThan(exact.json.length);
    expect(() => recallDirectedDestination(knowledge, at('S'), identity, target, { bytes: cap - 1 })).toThrow('byte budget');
  });

  it('omits supplemental examination under pressure without changing the exact remembered target', () => {
    const knowledge = memoryFixture();
    knowledge.examinations = { lever: remembered({ featureId: 'lever', detail: 'x'.repeat(65_536) }) };
    const { memory } = recallDirectedDestination(knowledge, at('S'), identity, { kind: 'feature', featureId: 'lever' });
    expect(memory.feature!.value.state).toBe('idle');
    expect(memory.examination).toBeUndefined();
    expect(memory.omissions).toMatchObject({ examinations: 1, causes: { bytes: true } });
    expect(recallDirectedDestination(knowledge, at('S'), identity, { kind: 'feature', featureId: 'lever' }, { facts: 1 }).memory.omissions.causes.facts).toBe(true);
  });

  it('validates identity, position, revision and exact destination before producing a response', () => {
    const knowledge = memoryFixture();
    expect(() => projectDirectedMemory(knowledge, at('S'), { ...identity, observerId: 'other' })).toThrow('mismatch');
    expect(() => projectDirectedMemory(knowledge, at('S'), { ...identity, worldId: 'other' })).toThrow('mismatch');
    expect(() => projectDirectedMemory(knowledge, at('S'), { ...identity, floorId: '' })).toThrow('identity');
    expect(() => projectDirectedMemory(knowledge, { ...at('S'), row: NaN }, identity)).toThrow('position');
    expect(() => overview({ ...knowledge, revision: -1 })).toThrow('revision');
    expect(() => recallDirectedDestination(knowledge, at('S'), identity, { kind: 'feature', featureId: '' })).toThrow('identity');
  });

  it('rejects future-dated or unsourced evidence instead of presenting it as current', () => {
    const knowledge = memoryFixture();
    knowledge.features.local.observedAt = 6;
    expect(() => overview(knowledge)).toThrow('evidence');
    knowledge.features.local.observedAt = 5;
    knowledge.features.local.observationId = '';
    expect(() => overview(knowledge)).toThrow('evidence');
  });

  it('cannot accept host world truth as a knowledge projection', () => {
    const world = { id: 'world', floorId: 'floor', revision: 1, spaces: {}, cells: {}, features: {} };
    expect(() => overview(world as unknown as KnowledgeProjection)).toThrow('mismatch');
  });

  it('cannot mutate shared defaults or constant response data through an empty result', () => {
    const knowledge: KnowledgeProjection = { worldId: identity.worldId, observerId: identity.observerId, revision: 0,
      cells: {}, spaces: {}, features: {}, absent: {} };
    const first = overview(knowledge);
    const before = structuredClone(first);
    (first.memory.unknowns as string[])[0] = 'changed';
    first.memory.bounds.cells = 100;
    expect(overview(knowledge)).toEqual(before);
    expect(DEFAULT_MEMORY_BOUNDS.cells).toBe(24);
  });
});
