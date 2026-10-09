import { describe, expect, it } from 'vitest';
import { addressKey } from '../expedition/address';
import { presentDirected } from './context';
import { createDirectedFixture } from './fixture';
import { emptyDirectedKnowledge, rememberDirected } from './knowledge';
import { observeDirected } from './perception';
import { DIRECTED_LIMITS } from './types';
import type { ObservedFeature, Remembered } from './types';

describe('exact directed consumer context', () => {
  it('emits an exact actor-scoped JSON contract rather than a host snapshot', () => {
    const { session } = createDirectedFixture();
    session.world.cells[addressKey(session.actor.position)].exits = {};
    const empty = emptyDirectedKnowledge('W1', 'P1');
    const observation = observeDirected(session.world, session.actor, empty, 'look');
    session.knowledge = rememberDirected(empty, observation);
    const context = presentDirected(session, 'presentation-1', 'human-view');
    const expected = '{"version":"directed-v1","worldId":"W1","floorId":"F1","observerId":"P1",'
      + '"position":{"spaceId":"H","row":2,"column":2},"knowledgeRevision":1,'
      + '"cells":[{"value":{"address":{"spaceId":"H","row":2,"column":2},"exits":{}},'
      + '"observationId":"W1:P1:observation:1","observedAt":1,"status":"current"}],'
      + '"spaces":[{"value":{"id":"H","name":"Hall","originX":8,"originZ":0,"rows":5,"columns":5},'
      + '"observationId":"W1:P1:observation:1","observedAt":1,"status":"current"}],"features":[],"absent":[]}';
    expect(context).toEqual({
      id: 'presentation-1', observerId: 'P1', knowledgeRevision: 1, purpose: 'human-view',
      observationIds: ['W1:P1:observation:1'], json: expected, bytes: new TextEncoder().encode(expected).byteLength,
    });
    expect(presentDirected(session, 'presentation-2', 'decision-fixture').json).toBe(expected);
  });

  it('labels latest evidence current and older evidence remembered, with complete provenance', () => {
    const { session } = createDirectedFixture();
    const context = presentDirected(session, 'labels', 'decision-fixture');
    const payload = JSON.parse(context.json);
    expect(payload.features.find((feature: Remembered<ObservedFeature>) => feature.value.id === 'D')).toMatchObject({
      status: 'current', observedAt: 17, observationId: 'W1:P1:observation:17',
    });
    expect(payload.features.find((feature: Remembered<ObservedFeature>) => feature.value.id === 'V')).toMatchObject({
      status: 'remembered', value: { state: 'idle' },
    });
    const entries = [...payload.cells, ...payload.spaces, ...payload.features, ...payload.absent];
    expect(new Set(context.observationIds)).toEqual(new Set(entries.map(entry => entry.observationId)));
    for (const entry of entries) expect(entry.status).toBe(entry.observedAt === 17 ? 'current' : 'remembered');
  });

  it('reconstructs knowledge from receipts and preserves exact archived presentation bytes across later truth changes', () => {
    const fixture = createDirectedFixture();
    const context = presentDirected(fixture.session, 'archive', 'decision-fixture');
    const stored = JSON.parse(JSON.stringify({ ...fixture, context }));
    const reconstructed = fixture.observations.reduce(rememberDirected, emptyDirectedKnowledge('W1', 'P1'));
    expect(reconstructed).toEqual(fixture.session.knowledge);
    expect(presentDirected({ ...fixture.session, knowledge: reconstructed }, context.id, context.purpose)).toEqual(context);
    const snapshot = structuredClone(fixture.session);
    fixture.session.world.features.D.state = 'open';
    fixture.session.world.features.V.state = 'active';
    fixture.session.world.revision += 10;
    fixture.session.revision += 10;
    fixture.session.epoch = 100;
    fixture.session.owner = 'private-host-owner';
    expect(presentDirected(fixture.session, context.id, context.purpose)).toEqual(context);
    fixture.session.world.cells = {};
    fixture.session.world.spaces = {};
    fixture.session.world.features = {};
    expect(presentDirected(fixture.session, context.id, context.purpose)).toEqual(context);
    expect(stored.context).toEqual(context);
    expect(presentDirected(stored.session, context.id, context.purpose)).toEqual(context);
    expect(presentDirected(snapshot, context.id, context.purpose)).toEqual(context);
    expect(context.json).not.toMatch(/sourceWorldRevision|"revision"|epoch|owner|hidden|Hidden Trap|"operation"/);
  });

  it('includes observed tombstone provenance and never synthesizes unseen missing features', () => {
    const { session } = createDirectedFixture();
    session.actor.position = { ...session.world.features.V.position };
    delete session.world.features.V;
    const observation = observeDirected(session.world, session.actor, session.knowledge, 'look');
    session.knowledge = rememberDirected(session.knowledge, observation);
    const context = presentDirected(session, 'removal', 'human-view');
    const payload = JSON.parse(context.json);
    expect(payload.absent).toEqual([{
      featureId: 'V', observationId: observation.id, observedAt: observation.sequence, status: 'current',
    }]);
    expect(payload.features.map((feature: Remembered<ObservedFeature>) => feature.value.id)).toEqual(['D']);
    expect(context.observationIds).toContain(observation.id);
  });

  it('is stable across record insertion order and leaves its session unchanged', () => {
    const { session } = createDirectedFixture();
    const before = structuredClone(session);
    const context = presentDirected(session, 'sorted', 'human-view');
    expect(session).toEqual(before);
    for (const key of ['cells', 'spaces', 'features', 'absent'] as const) {
      Object.assign(session.knowledge, { [key]: Object.fromEntries(Object.entries(session.knowledge[key]).reverse()) });
    }
    expect(presentDirected(session, 'sorted', 'human-view')).toEqual(context);
  });

  it('counts UTF-8 bytes and accepts exactly the byte cap, refusing overflow without truncation', () => {
    const { session } = createDirectedFixture();
    session.knowledge.spaces.L.value.name = '\u00e9';
    const unicode = presentDirected(session, 'unicode', 'human-view');
    expect(unicode.bytes).toBe(new TextEncoder().encode(unicode.json).byteLength);
    expect(unicode.bytes).toBeGreaterThan(unicode.json.length);
    session.knowledge.spaces.L.value.name = '';
    const base = presentDirected(session, 'cap', 'human-view');
    session.knowledge.spaces.L.value.name = 'x'.repeat(DIRECTED_LIMITS.bytes - base.bytes);
    expect(presentDirected(session, 'cap', 'human-view').bytes).toBe(DIRECTED_LIMITS.bytes);
    session.knowledge.spaces.L.value.name += 'x';
    const before = structuredClone(session);
    expect(() => presentDirected(session, 'cap', 'human-view')).toThrow('byte limit');
    expect(session).toEqual(before);
  });

  it('refuses another world or observer projection', () => {
    const { session } = createDirectedFixture();
    session.knowledge.worldId = 'W2';
    expect(() => presentDirected(session, 'mismatch', 'human-view')).toThrow('mismatch');
    session.knowledge.worldId = 'W1';
    session.knowledge.observerId = 'P2';
    expect(() => presentDirected(session, 'mismatch', 'human-view')).toThrow('mismatch');
  });
});
