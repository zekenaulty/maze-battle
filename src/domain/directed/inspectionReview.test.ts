import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditDirectedSave } from '../../persistence/directed/audit';
import type { DirectedTransaction, SaveRecord } from '../../persistence/directed/database';
import { contextFromSource } from '../../persistence/directed/journalValidation';
import { readDirectedSave, reconcileDirectedRequest } from '../../persistence/directed/repository';
import { request as validateRequest } from '../../persistence/directed/requestValidation';
import * as validate from '../../persistence/directed/stateValidation';
import { addressKey } from '../expedition/address';
import { presentDirected } from './context';
import { completeDestinationStep, createDestinationOperation } from './destinationExecution';
import { createDirectedWorld } from './fixture';
import { emptyDirectedKnowledge, rememberDirected } from './knowledge';
import { actorNavigationGraph } from './navigation';
import type { DirectedReceipt, DirectedRequest, DirectedSession } from './operationTypes';
import type { PerceptionProfileId } from './perceptionTypes';
import { applyDirectedCommand } from './transition';

const database = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../../persistence/directed/database', async importOriginal => ({
  ...await importOriginal<typeof import('../../persistence/directed/database')>(),
  transaction: database.transaction,
  slotRange: (slot: string) => ({ slot }),
}));
afterEach(() => database.transaction.mockReset());

function setup(profile: PerceptionProfileId | undefined = 'expert'): DirectedSession {
  return {
    version: 'directed-v1', epoch: 1, revision: 0, owner: 'review', world: createDirectedWorld(),
    actor: { id: 'P1', position: { spaceId: 'W', row: 0, column: 0 },
      ...(profile === undefined ? {} : { perceptionProfile: profile }) },
    knowledge: emptyDirectedKnowledge('W1', 'P1'),
  };
}

function inspect(session: DirectedSession, direction: 'east' | 'here' | 'north' = 'east') {
  return applyDirectedCommand(session, { type: 'inspect', direction }, 0, 'original-inspection');
}

// Exercise real read/audit/reconciliation validators over one immutable journal.
// Only the storage transport is substituted; this is not an IndexedDB durability test.
function archivedInspection() {
  const previous = setup();
  const result = inspect(previous);
  const request: DirectedRequest = { attemptId: 'original-inspection', owner: 'review', epoch: 1,
    expectedRevision: 0, command: { type: 'inspect', direction: 'east' } };
  const receipt: DirectedReceipt = { request, result: result.outcome, revision: result.session.revision,
    observationIds: result.observations.map(value => value.id), eventIds: [] };
  const context = presentDirected(result.session, 'archived-context', 'decision-fixture');
  const record: SaveRecord = { session: result.session,
    counts: { observations: 1, projections: 2, events: 0, contexts: 1, receipts: 1 } };
  type Row = { key: string | [string, string | number]; value: unknown };
  const slot = 'inspection-review';
  const stores: Record<string, Row[]> = {
    saves: [{ key: slot, value: record }], worlds: [{ key: slot, value: result.session.world }],
    observations: [{ key: [slot, 1], value: result.observations[0] }],
    projections: [{ key: [slot, 0], value: previous.knowledge }, { key: [slot, 1], value: result.session.knowledge }],
    events: [], contexts: [{ key: [slot, context.id], value: context }],
    receipts: [{ key: [slot, request.attemptId], value: receipt }],
  };
  const tx = {
    objectStore(name: string) {
      const rows = stores[name];
      const selected = (query?: unknown) => query === undefined || (typeof query === 'object' && !Array.isArray(query))
        ? rows : rows.filter(row => JSON.stringify(row.key) === JSON.stringify(query));
      const cursor = (index: number): unknown => index >= rows.length ? null : {
        key: structuredClone(rows[index].key), value: structuredClone(rows[index].value),
        continue: async () => cursor(index + 1),
      };
      return {
        get: async (key: unknown) => structuredClone(selected(key)[0]?.value),
        getAll: async (query?: unknown) => structuredClone(selected(query).map(row => row.value)),
        getAllKeys: async (query?: unknown) => structuredClone(selected(query).map(row => row.key)),
        count: async (query?: unknown) => selected(query).length,
        openCursor: async () => cursor(0),
      };
    },
  } as unknown as DirectedTransaction;
  database.transaction.mockImplementation(async (work: (transaction: DirectedTransaction) => Promise<unknown>) =>
    structuredClone(await work(tx)));
  return { slot, receipt, source: result.observations[0], stores };
}

describe('NS3 independent review: receipt and replay regressions', () => {
  it('accepts an unchanged archived inspection through read, full audit and reconciliation', async () => {
    const archive = archivedInspection();
    expect((await readDirectedSave(archive.slot))?.knowledge.inspection?.value.attemptId).toBe('original-inspection');
    expect((await auditDirectedSave(archive.slot)).receipts).toEqual([archive.receipt]);
    expect(await reconcileDirectedRequest(archive.slot, archive.receipt.request)).toEqual(archive.receipt);
  });

  it.each(['direction', 'command', 'attempt'] as const)('rejects a receipt whose %s contradicts unchanged inspection evidence', async field => {
    const archive = archivedInspection();
    if (field === 'direction') archive.receipt.request.command = { type: 'inspect', direction: 'west' };
    if (field === 'command') archive.receipt.request.command = { type: 'look' };
    if (field === 'attempt') {
      archive.receipt.request.attemptId = 'unrelated-attempt';
      archive.stores.receipts[0].key = [archive.slot, 'unrelated-attempt'];
    }
    expect(archive.source.scene.inspection).toMatchObject({ attemptId: 'original-inspection', direction: 'east' });
    await expect(auditDirectedSave(archive.slot).then(() => undefined)).rejects.toThrow();
  });

  it('does not reconcile a substituted request against another inspection source', async () => {
    const archive = archivedInspection();
    archive.receipt.request.command = { type: 'inspect', direction: 'west' };
    await expect(reconcileDirectedRequest(archive.slot, archive.receipt.request).then(() => undefined)).rejects.toThrow();
  });

  it('rejects an inspection reason on the legacy policy without attempt or perception evidence', () => {
    const previous = setup();
    delete previous.actor.perceptionProfile;
    const result = applyDirectedCommand(previous, { type: 'look' }, 0);
    const forged = structuredClone(result.observations[0]);
    expect(forged.policyVersion).toBe('fixture-visibility-v1');
    forged.reason = 'inspection';
    expect(() => validate.observation(forged, result.session)).toThrow();
  });

  it('rejects unsupported absence of a detected concealed feature after downgrade', () => {
    const initial = inspect(setup());
    initial.session.actor.perceptionProfile = 'untrained';
    const current = applyDirectedCommand(initial.session, { type: 'look' }, 1);
    const forged = structuredClone(current.observations[0]);
    forged.scene.absentFeatureIds = ['T'];
    expect(initial.session.knowledge.features.T.value.disclosure).toBe('detected');
    expect(forged.scene.cells.some(cell => addressKey(cell.address) === addressKey(initial.session.world.features.T.position))).toBe(true);
    expect(() => {
      validate.observation(forged, current.session);
      rememberDirected(initial.session.knowledge, forged);
    }).toThrow();
  });
});

describe('NS3 independent review: disclosure and navigation controls', () => {
  it.each(['untrained', 'alert'] as const)('keeps %s public facts and route graph independent of concealed identity/count/state', profile => {
    const first = setup(profile);
    const second = structuredClone(first);
    const hidden = second.world.features.T;
    delete second.world.features.T;
    second.world.features.X = { ...hidden, id: 'X', name: 'Private gate', kind: 'door', state: 'locked' };
    second.world.features.Y = { ...hidden, id: 'Y', name: 'Private mechanism', state: 'active' };
    const left = inspect(first), right = inspect(second);
    expect(left.observations[0].scene).toEqual(right.observations[0].scene);
    expect(presentDirected(left.session, 'left', 'human-view').json)
      .toBe(presentDirected(right.session, 'right', 'decision-fixture').json);
    expect(actorNavigationGraph(left.session.knowledge)).toEqual(actorNavigationGraph(right.session.knowledge));
  });

  it.each(['untrained', 'alert', undefined] as const)('retains historical detection and detail when the current profile becomes %s', profile => {
    const initial = inspect(setup());
    const source = structuredClone(initial.observations[0]);
    const archived = presentDirected(initial.session, 'historical', 'decision-fixture');
    const previous = structuredClone(initial.session);
    if (profile === undefined) delete previous.actor.perceptionProfile;
    else previous.actor.perceptionProfile = profile;
    previous.world.features.T.state = 'active';
    const current = applyDirectedCommand(previous, { type: 'look' }, 1);
    expect(current.session.knowledge.features.T).toEqual(initial.session.knowledge.features.T);
    expect(current.session.knowledge.examinations?.T).toEqual(initial.session.knowledge.examinations?.T);
    expect(current.observations[0].scene.absentFeatureIds).not.toContain('T');
    expect(() => validate.observation(source, current.session)).not.toThrow();
    expect(() => contextFromSource(archived, initial.session.knowledge, source, initial.session.world.floorId)).not.toThrow();
    expect(initial.observations[0]).toEqual(source);
  });

  it.each(['missing-crossing', 'closed-door'] as const)('does not give concealed detail across a %s', obstacle => {
    const previous = setup();
    if (obstacle === 'missing-crossing') delete previous.world.cells[addressKey(previous.actor.position)].exits.east;
    else previous.world.features.D.position = { ...previous.world.features.T.position };
    validate.session(previous);
    const result = inspect(previous);
    expect(result.observations[0].scene.inspection).toMatchObject({ coveredCells: [], limitation: 'no-visible-crossing' });
    expect(result.session.knowledge.features.T).toBeUndefined();
    expect(result.observations[0].scene.examinations).toEqual([]);
  });

  it('requires deliberate coverage, not passive vision or inspection in another direction', () => {
    const previous = setup();
    const passive = applyDirectedCommand(previous, { type: 'look' }, 0);
    const elsewhere = inspect(previous, 'north');
    for (const result of [passive, elsewhere]) {
      expect(result.session.knowledge.features.T).toBeDefined();
      expect(result.observations[0].scene.examinations).toEqual([]);
    }
    expect(inspect(previous).observations[0].scene.examinations).toHaveLength(1);
  });

  it.each([
    { effectiveValue: 99 }, { perceptionProfile: 'expert' }, { profileId: 'expert' },
    { viewpoint: { spaceId: 'H', row: 0, column: 0 } }, { featureId: 'T' }, { threshold: 0 },
  ])('rejects caller inspection authority fields %j', extra => {
    const request = { attemptId: 'forged', owner: 'review', epoch: 1, expectedRevision: 0,
      command: { type: 'inspect', direction: 'east', ...extra } };
    expect(() => validateRequest(request)).toThrow('unexpected fields');
  });
});

describe('NS3 independent review: generic destination execution', () => {
  it('returns an independent remaining route after a completed step', () => {
    const operation = createDestinationOperation({ id: 'review-trip', target: { id: 'destination' }, epoch: 1, now: 0,
      plan: { status: 'ready', distance: 2, visits: 3, route: [
        { spaceId: 'W', row: 0, column: 1 }, { spaceId: 'W', row: 0, column: 2 },
      ] } });
    const original = structuredClone(operation);
    const completed = completeDestinationStep(operation, false);
    completed.route[0].column = 99;
    expect(operation).toEqual(original);
  });
});
