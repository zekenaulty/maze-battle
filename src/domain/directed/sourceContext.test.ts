import { describe, expect, it } from 'vitest';
import { createDirectedFixture } from './fixture';
import { presentObservationSources } from './sourceContext';
import { applyDirectedCommand } from './transition';
import type { ObservationReceipt } from './types';

const identity = { worldId: 'W1', floorId: 'F1', observerId: 'P1' };
function fixture() {
  const value = createDirectedFixture();
  return { ...value, source: value.observations.at(-1)!, revision: value.session.knowledge.revision };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

describe('actor-only observation source context', () => {
  it('returns exact original public facts in requested order with explicit missing IDs', () => {
    const { observations, revision } = fixture();
    const selected = [observations[0], observations[1]];
    const ids = [selected[1].id, 'not-observed', selected[0].id];
    const result = presentObservationSources(identity, revision, ids, selected);
    const body = JSON.parse(result.json);
    expect(body).toMatchObject({ version: 'directed-sources-v1', ...identity, knowledgeRevision: revision,
      requestedSourceIds: ids, missingIds: ['not-observed'] });
    expect(body.observations.map((source: ObservationReceipt) => source.id)).toEqual([selected[1].id, selected[0].id]);
    expect(body.observations[0].scene).toEqual(selected[1].scene);
    expect(body.observations[0].sequence).toBe(selected[1].sequence);
    expect(result.observationIds).toEqual([selected[1].id, selected[0].id]);
    expect(result.bytes).toBe(new TextEncoder().encode(result.json).byteLength);
    expect(presentObservationSources(identity, revision, ids, [...selected].reverse())).toEqual(result);
  });

  it('never reads audit-only or extra fields, including nested hidden fields', () => {
    const { source, revision } = fixture();
    const expected = presentObservationSources(identity, revision, [source.id], [source]);
    const forbidden = { get: () => { throw new Error('Private field read'); }, enumerable: true };
    Object.defineProperty(source, 'sourceWorldRevision', forbidden);
    Object.defineProperty(source, 'world', forbidden);
    Object.defineProperty(source.scene, 'privateMechanisms', forbidden);
    Object.defineProperty(source.scene.position, 'privatePosition', forbidden);
    Object.defineProperty(source.scene.features[0], 'hidden', forbidden);
    Object.defineProperty(source.scene.spaces[0], 'privateContents', forbidden);
    const result = presentObservationSources(identity, revision, [source.id], [source]);
    expect(result).toEqual(expected);
    expect(result.json).not.toMatch(/sourceWorldRevision|hidden|private|Hidden Trap/);
  });

  it('does not mutate sources or identity, and never refreshes original facts from changed truth', () => {
    const { source, revision, session } = fixture();
    const before = structuredClone(source);
    const ids = freeze([source.id]);
    const result = presentObservationSources(freeze({ ...identity }), revision, ids, freeze([freeze(source)]));
    session.world.features.D.state = 'open';
    expect(presentObservationSources(identity, revision, [source.id], [source])).toEqual(result);
    expect(source).toEqual(before);
    expect(JSON.parse(result.json).observations[0].scene.features[0].state).toBe('locked');
    result.observationIds.push('changed');
    expect(ids).toEqual([source.id]);
  });

  it('keeps later source IDs missing at an archived knowledge revision', () => {
    const { observations, revision } = fixture();
    const later = observations.at(-1)!;
    const ids = [observations[0].id, later.id];
    const original = presentObservationSources(identity, 1, ids, [observations[0]]);
    expect(presentObservationSources(identity, 1, ids, [observations[0], later])).toEqual(original);
    expect(JSON.parse(original.json).missingIds).toEqual([later.id]);
    const current = presentObservationSources(identity, revision, ids, [observations[0], later]);
    expect(JSON.parse(current.json).missingIds).toEqual([]);
  });

  it('preserves NS-3 inspection/perception and examination facts without upgrading them', () => {
    const { session } = createDirectedFixture({ perceptionProfile: 'expert' });
    const inspected = applyDirectedCommand(session, { type: 'inspect', direction: 'east' }, 0, 'source-inspection');
    const source = inspected.observations[0];
    const result = presentObservationSources(identity, inspected.session.knowledge.revision, [source.id], [source]);
    const publicSource = JSON.parse(result.json).observations[0];
    expect(publicSource.perception).toEqual(source.perception);
    expect(publicSource.scene.inspection).toEqual(source.scene.inspection);
    expect(publicSource.scene.examinations).toEqual(source.scene.examinations);
    expect(publicSource.scene.cues).toEqual(source.scene.cues);
    expect(publicSource.sourceWorldRevision).toBeUndefined();
  });

  it('preserves actor-permitted traversal and crossing recovery evidence', () => {
    const { source, revision } = fixture();
    const from = source.scene.position;
    const to = source.scene.cells[0].address;
    source.scene.traversal = { from, to, passable: false };
    source.scene.crossingRecovery = { policyVersion: 'observed-door-change-v1', edges: [{ from, to, featureId: 'D', change: 'opened' }] };
    const body = JSON.parse(presentObservationSources(identity, revision, [source.id], [source]).json);
    expect(body.observations[0].scene.traversal).toEqual(source.scene.traversal);
    expect(body.observations[0].scene.crossingRecovery).toEqual(source.scene.crossingRecovery);
  });

  it.each(['worldId', 'observerId'] as const)('rejects a source from another %s, even if it is later than the requested revision', field => {
    const { source, revision } = fixture();
    source[field] = 'other';
    expect(() => presentObservationSources(identity, revision, [source.id], [source])).toThrow('scope mismatch');
    expect(() => presentObservationSources(identity, 0, [source.id], [source])).toThrow('scope mismatch');
  });

  it('rejects duplicates, substitutions and conflicting sequence identities', () => {
    const { source, revision } = fixture();
    expect(() => presentObservationSources(identity, revision, [source.id], [source, source])).toThrow('duplicate source');
    expect(() => presentObservationSources(identity, revision, ['another'], [source])).toThrow('unrequested');
    expect(() => presentObservationSources(identity, revision, [source.id, 'alias'], [source, { ...source, id: 'alias' }])).toThrow('sequence mismatch');
    expect(() => presentObservationSources(identity, revision, [source.id], [{ ...source, sequence: 0 }])).toThrow('integer');
  });

  it.each([null, undefined, 'id', [''], ['a', 'a'], ['x'.repeat(161)], ['bad\nID'], [12], Array(1), Array.from({ length: 9 }, (_, i) => `id-${i}`)])
    ('rejects malformed or unbounded source-ID requests %j', ids => {
      expect(() => presentObservationSources(identity, 0, ids as string[], [])).toThrow();
    });

  it('allows exactly eight IDs of 160 characters, and empty requests without inventing facts', () => {
    const ids = Array.from({ length: 8 }, (_, index) => `${index}${'x'.repeat(159)}`);
    const result = presentObservationSources(identity, 0, ids, []);
    expect(JSON.parse(result.json)).toMatchObject({ requestedSourceIds: ids, observations: [], missingIds: ids });
    expect(result.observationIds).toEqual([]);
    expect(JSON.parse(presentObservationSources(identity, 0, [], []).json).missingIds).toEqual([]);
  });

  it('fails the whole packet beyond 64 KiB and counts UTF-8 rather than characters', () => {
    const { source, revision } = fixture();
    source.scene.spaces[0].name = '';
    const base = presentObservationSources(identity, revision, [source.id], [source]);
    source.scene.spaces[0].name = 'x'.repeat(65_536 - base.bytes);
    expect(presentObservationSources(identity, revision, [source.id], [source]).bytes).toBe(65_536);
    source.scene.spaces[0].name += 'x';
    expect(() => presentObservationSources(identity, revision, [source.id], [source])).toThrow('byte limit');
    source.scene.spaces[0].name = '\u00e9'.repeat(Math.floor((65_536 - base.bytes) / 2));
    const utf8 = presentObservationSources(identity, revision, [source.id], [source]);
    expect(utf8.bytes).toBeGreaterThan(utf8.json.length);
    source.scene.spaces[0].name += '\u00e9';
    expect(() => presentObservationSources(identity, revision, [source.id], [source])).toThrow('byte limit');
  });

  it('enforces the byte cap across multiple complete observations, never by dropping a requested source', () => {
    const { observations, revision } = fixture();
    const sources = observations.slice(0, 2);
    for (const source of sources) source.scene.spaces[0].name = 'x'.repeat(40_000);
    for (const source of sources) expect(presentObservationSources(identity, revision, [source.id], [source]).bytes).toBeLessThan(65_536);
    expect(() => presentObservationSources(identity, revision, sources.map(source => source.id), sources)).toThrow('byte limit');
  });

  it('rejects malformed identity, revision, source arrays and non-scalar whitelisted text', () => {
    const { source, revision } = fixture();
    expect(() => presentObservationSources({ ...identity, floorId: '' }, revision, [], [])).toThrow('identifier');
    for (const value of [-1, NaN, Infinity, 1.5]) expect(() => presentObservationSources(identity, value, [], [])).toThrow('integer');
    expect(() => presentObservationSources(identity, revision, [], Array(9).fill(source))).toThrow('array limit');
    source.scene.spaces[0].name = { privateTruth: true } as unknown as string;
    expect(() => presentObservationSources(identity, revision, [source.id], [source])).toThrow('source text');
  });
});
