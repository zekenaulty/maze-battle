import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectedMemory } from '../../components/directed/DirectedMemory';
import type { DirectedTransaction, SaveRecord } from '../../persistence/directed/database';
import { context, contextFromSource } from '../../persistence/directed/journalValidation';
import { validateLineage } from '../../persistence/directed/lineage';
import { canonical } from '../../persistence/directed/values';
import { presentDirected } from './context';
import { createDirectedFixture, createDirectedWorld } from './fixture';
import { emptyDirectedKnowledge, rememberDirected } from './knowledge';
import { presentDirectedMemory } from './memoryContext';
import type { DirectedSession } from './operationTypes';
import { presentSourceContext } from './sourcePresentation';
import { applyDirectedCommand } from './transition';
import type { PresentedContext } from './types';

vi.mock('../../persistence/directed/database', async importOriginal => ({
  ...await importOriginal<typeof import('../../persistence/directed/database')>(), slotRange: (slot: string) => ({ slot }),
}));
afterEach(cleanup);

function histories() {
  const initial = createDirectedFixture();
  const identity = { worldId: initial.session.world.id, floorId: initial.session.world.floorId, observerId: initial.session.actor.id };
  const original = initial.session;
  const later = applyDirectedCommand(original, { type: 'look' }, 0);
  const requested = [initial.observations[0].id, later.observations[0].id];
  const sources = presentSourceContext(identity, original.knowledge.revision, 'source-archive', 'decision-fixture',
    { kind: 'sources', sourceIds: requested }, [initial.observations[0]]);
  const memory = presentDirectedMemory(original, 'recall-archive', 'human-view',
    { kind: 'destination', target: { kind: 'feature', featureId: 'V' } });
  const legacy = presentDirected(original, 'legacy-archive', 'human-view');
  const originalSource = initial.observations.at(-1)!;
  const retrieved = [initial.observations[0], later.observations[0]];
  return { initial, original, later, requested, sources, memory, legacy, originalSource, retrieved };
}
function rewrite(value: PresentedContext, change: (body: Record<string, any>) => void): PresentedContext {
  const result = structuredClone(value);
  const body = JSON.parse(result.json);
  change(body);
  result.json = JSON.stringify(body);
  result.bytes = new TextEncoder().encode(result.json).byteLength;
  return result;
}

// Real lineage/dispatch/identity validators with read-only mock transport, not an IndexedDB durability claim.
function journal(checkpoint: boolean, changedContext?: (value: PresentedContext) => PresentedContext) {
  const history = histories();
  const { original, later } = history;
  const observations = [...history.initial.observations, ...later.observations];
  const contexts = [history.legacy, history.memory, changedContext ? changedContext(history.sources) : history.sources];
  const slot = 'archive-review';
  const record: SaveRecord = { session: later.session, ...(checkpoint ? { historyMode: 'checkpoint-v1' as const } : {}),
    counts: { observations: observations.length, projections: observations.length + 1,
      events: history.initial.events.length, contexts: contexts.length, receipts: 0 } };
  type Row = { key: (string | number)[]; value: unknown };
  const rows: Record<string, Row[]> = { contexts: contexts.map(value => ({ key: [slot, value.id], value })),
    observations: observations.map(value => ({ key: [slot, value.sequence], value })), projections: [], witnesses: [], identities: [] };
  let knowledge = emptyDirectedKnowledge(original.world.id, original.actor.id);
  rows.projections.push({ key: [slot, 0], value: knowledge });
  for (const source of observations) {
    knowledge = rememberDirected(knowledge, source);
    rows.projections.push({ key: [slot, knowledge.revision], value: knowledge });
    if (checkpoint) {
      rows.identities.push({ key: [slot, 'observations', source.id], value: source.sequence });
      rows.witnesses.push({ key: [slot, 'identity:observations', source.id], value: canonical(source.sequence) },
        { key: [slot, 'observations', source.sequence], value: canonical(source) });
    }
  }
  for (const value of contexts.filter(value => value.selection)) rows.witnesses.push({
    key: [slot, 'contexts', value.id], value: canonical(value),
  });
  const tx = {
    objectStore(name: string) {
      const values = rows[name];
      const cursor = (index: number): unknown => index >= values.length ? null : {
        key: values[index].key, value: structuredClone(values[index].value), continue: async () => cursor(index + 1),
      };
      return {
        get: async (key: unknown) => structuredClone(values.find(row => JSON.stringify(row.key) === JSON.stringify(key))?.value),
        getAll: async (_range: unknown, limit?: number) => structuredClone(values.slice(0, limit).map(row => row.value)),
        getAllKeys: async (_range: unknown, limit?: number) => structuredClone(values.slice(0, limit).map(row => row.key)),
        openCursor: async () => cursor(0),
      };
    },
  } as unknown as DirectedTransaction;
  return { tx, slot, record, contexts, history };
}

describe('independent source archive integration review at c469f28', () => {
  it('dispatches legacy, recall and source archives to their own exact historical builders', () => {
    const history = histories();
    for (const value of [history.legacy, history.memory, history.sources]) {
      expect(() => context(value, history.later.session)).not.toThrow();
      expect(() => contextFromSource(value, history.original.knowledge, history.originalSource, 'F1', history.retrieved)).not.toThrow();
    }
    expect(JSON.parse(history.sources.json).missingIds).toEqual([history.requested[1]]);
    expect(history.sources.json).not.toMatch(/sourceWorldRevision|Hidden Trap|pressure-sensitive/);
    expect(history.memory.json).not.toMatch(/sourceWorldRevision|Hidden Trap|pressure-sensitive/);
  });

  it.each([true, false])('validates mixed archives and later formerly-missing IDs with checkpoint=%s', async checkpoint => {
    const value = journal(checkpoint);
    await expect(validateLineage(value.tx, value.slot, value.record)).resolves.toBeUndefined();
    expect(value.contexts[2]).toEqual(value.history.sources);
  });

  it.each([true, false])('rejects an injected privileged field even with a matching context witness, checkpoint=%s', async checkpoint => {
    const value = journal(checkpoint, original => rewrite(original, body => { body.observations[0].sourceWorldRevision = 999; }));
    await expect(validateLineage(value.tx, value.slot, value.record)).rejects.toThrow('differs from historical sources');
  });

  it.each(['legacy', 'memory', 'sources'] as const)('rejects a %s archive with a mismatched selection/version pair', kind => {
    const history = histories();
    const value = structuredClone(history[kind]);
    if (kind === 'sources') delete value.selection;
    else value.selection = { kind: 'sources', sourceIds: [] };
    expect(() => context(value, history.later.session)).toThrow('envelope mismatch');
  });

  it.each(['worldId', 'observerId', 'floorId'] as const)('rejects forged top-level %s scope', key => {
    const history = histories();
    const value = rewrite(history.sources, body => { body[key] = 'other'; });
    expect(() => context(value, history.later.session)).toThrow('envelope mismatch');
  });

  it('rejects changed nested source identities and substituted provenance lists during exact validation', () => {
    const history = histories();
    const validate = (value: PresentedContext) => contextFromSource(value, history.original.knowledge,
      history.originalSource, 'F1', history.retrieved);
    for (const field of ['id', 'worldId', 'observerId']) {
      expect(() => validate(rewrite(history.sources, body => { body.observations[0][field] = 'other'; })))
        .toThrow('differs from historical sources');
    }
    expect(() => validate({ ...history.sources, observationIds: [history.requested[1]] })).toThrow('differs from historical sources');
    const mismatched = { ...history.retrieved[0], observerId: 'other' };
    expect(() => contextFromSource(history.sources, history.original.knowledge, history.originalSource, 'F1', [mismatched]))
      .toThrow('scope mismatch');
  });

  it('rejects refreshing a previously missing source inside an archived response', () => {
    const history = histories();
    const current = presentSourceContext({ worldId: 'W1', floorId: 'F1', observerId: 'P1' }, history.later.session.knowledge.revision,
      history.sources.id, history.sources.purpose, { kind: 'sources', sourceIds: history.requested }, history.retrieved);
    const forged = rewrite({ ...current, knowledgeRevision: history.original.knowledge.revision }, body => {
      body.knowledgeRevision = history.original.knowledge.revision;
    });
    expect(() => contextFromSource(forged, history.original.knowledge, history.originalSource, 'F1', history.retrieved))
      .toThrow('differs from historical sources');
  });

  it('keeps distant recall tied to its original projection rather than changed world truth', () => {
    const history = histories();
    history.later.session.world.features.V.state = 'active';
    expect(() => contextFromSource(history.memory, history.original.knowledge, history.originalSource, 'F1')).not.toThrow();
    const refreshed = rewrite(history.memory, body => { body.feature.value.state = 'active'; });
    expect(() => contextFromSource(refreshed, history.original.knowledge, history.originalSource, 'F1'))
      .toThrow('differs from historical sources');
  });

  it('retains the legacy empty-blocked-edge compatibility branch without weakening new-context dispatch', () => {
    const history = histories();
    const old = rewrite(history.legacy, body => { delete body.blockedEdges; });
    expect(() => contextFromSource(old, history.original.knowledge, history.originalSource, 'F1')).not.toThrow();
    const mislabeled = rewrite(history.sources, body => { body.version = 'directed-v1'; delete body.blockedEdges; });
    expect(() => contextFromSource(mislabeled, history.original.knowledge, history.originalSource, 'F1', history.retrieved)).toThrow('envelope mismatch');
  });

  it('does not label a budget-omitted known examination as Uninspected', () => {
    const session: DirectedSession = { version: 'directed-v1', epoch: 0, revision: 0, world: createDirectedWorld(),
      actor: { id: 'P1', position: { spaceId: 'W', row: 0, column: 0 }, perceptionProfile: 'expert' },
      knowledge: emptyDirectedKnowledge('W1', 'P1') };
    const inspected = applyDirectedCommand(session, { type: 'inspect', direction: 'east' }, 0, 'review-inspection').session;
    expect(inspected.knowledge.examinations?.T).toBeDefined();
    const value = presentDirectedMemory(inspected, 'omitted-examination', 'human-view', {
      kind: 'destination', target: { kind: 'feature', featureId: 'T' }, bounds: { facts: 1 },
    });
    const body = JSON.parse(value.json);
    expect(body.feature.value.id).toBe('T');
    expect(body.examination).toBeUndefined();
    expect(body.omissions).toMatchObject({ examinations: 1, causes: { facts: true } });
    render(<DirectedMemory context={value} busy={false} recall={vi.fn()} loadSource={vi.fn()} />);
    expect(screen.queryByText('Uninspected', { exact: true })).not.toBeInTheDocument();
  });
});
