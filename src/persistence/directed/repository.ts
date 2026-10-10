import { presentDirected } from '../../domain/directed/context';
import { createDirectedFixture } from '../../domain/directed/fixture';
import { applyDirectedCommand } from '../../domain/directed/transition';
import type { DirectedReceipt, DirectedRequest, DirectedSession, DirectedTransition } from '../../domain/directed/operationTypes';
import { DIRECTED_LIMITS, type PresentedContext } from '../../domain/directed/types';
import { transaction, type DirectedTransaction, type SaveRecord } from './database';
import { appendHistory } from './history';
import { context, receipt } from './journalValidation';
import { capacity, load, requireSave } from './records';
import { assertUnusedOperation, originalReceipt, storeReceipt } from './attempts';
import { saveHeadWitness, verifyWitness, witness } from './witnesses';
import { contextFromSource } from './journalValidation';
import { observation, projection } from './stateValidation';
import { request as validateRequest } from './requestValidation';
import { session as validateSession } from './stateValidation';
import { check, id, integer, same } from './values';

async function checkpoint(tx: DirectedTransaction, slot: string, record: SaveRecord) {
  validateSession(record.session);
  await tx.objectStore('worlds').put(record.session.world, slot);
  await tx.objectStore('saves').put(record, slot);
  await saveHeadWitness(tx, slot, record);
}
function snapshotRequest(request: DirectedRequest) {
  validateRequest(request);
  return structuredClone(request);
}
export async function createDirectedSave(slot: string, options: NonNullable<Parameters<typeof createDirectedFixture>[0]>
  & { historyMode?: 'checkpoint-v1' | 'legacy-full-audit' } = {}): Promise<DirectedSession> {
  id(slot);
  check(options.historyMode === undefined || ['checkpoint-v1', 'legacy-full-audit'].includes(options.historyMode), 'unsupported history mode');
  return transaction(async tx => {
    const existing = await load(tx, slot);
    if (existing) return existing.session;
    const fixture = createDirectedFixture(options);
    validateSession(fixture.session);
    const record: SaveRecord = { session: fixture.session, counts: { observations: 0, projections: 0, events: 0, contexts: 0, receipts: 0 } };
    if (options.historyMode !== 'legacy-full-audit') record.historyMode = 'checkpoint-v1';
    await appendHistory(tx, slot, record.counts, undefined, fixture.session, fixture.observations, fixture.events, Boolean(record.historyMode));
    await tx.objectStore('worlds').add(record.session.world, slot);
    await tx.objectStore('saves').add(record, slot);
    if (record.historyMode) await tx.objectStore('controlReserve').add({ padding: ' '.repeat(16384) }, slot);
    await saveHeadWitness(tx, slot, record);
    return record.session;
  });
}
export async function readDirectedSave(slot: string): Promise<DirectedSession | undefined> {
  id(slot);
  return transaction(async tx => (await load(tx, slot))?.session);
}
export async function claimDirectedSave(slot: string, owner: string): Promise<DirectedSession> {
  id(slot); id(owner);
  return transaction(async tx => {
    const record = await requireSave(tx, slot);
    const current = record.session;
    if (current.owner === owner) return current;
    record.session = { ...current, owner, epoch: current.epoch + 1, revision: current.revision + 1 };
    if (current.operation?.status === 'running') {
      record.session.operation = { ...current.operation, status: 'cancelled', reason: 'owner-takeover', route: [] };
    }
    await checkpoint(tx, slot, record);
    return record.session;
  });
}
/** Replay is checked before fencing. Stale requests return an unjournaled refusal. */
export async function executeDirectedRequest(slot: string, input: DirectedRequest, now: number): Promise<DirectedReceipt> {
  id(slot); integer(now);
  const request = snapshotRequest(input);
  return transaction(async tx => {
    const record = await requireSave(tx, slot);
    const replay = await originalReceipt(tx, slot, request, record);
    if (replay) return replay;
    const current = record.session;
    const reason = request.owner !== current.owner ? 'stale-owner'
      : request.epoch !== current.epoch ? 'stale-epoch'
        : request.expectedRevision !== current.revision ? 'stale-revision' : undefined;
    if (reason) return { request, revision: current.revision, observationIds: [], eventIds: [],
      result: { status: 'refused', reason, position: current.actor.position } };
    await assertUnusedOperation(tx, slot, request, record);
    const cancelling = request.command.type === 'cancel';
    const terminal = Boolean(cancelling && record.historyMode && record.counts.receipts >= DIRECTED_LIMITS.history);
    // A pure transition cannot commit effects; full journals fail before invoking it.
    for (const name of ['receipts', 'observations', 'projections', 'events'] as const) {
      if (!cancelling) check(record.counts[name] < DIRECTED_LIMITS.history, `${name} journal full`);
    }
    const transition: DirectedTransition = applyDirectedCommand(structuredClone(current), structuredClone(request.command), now, request.attemptId);
    validateSession(transition.session);
    const next = transition.session;
    check(next.world.id === current.world.id && next.world.floorId === current.world.floorId && next.actor.id === current.actor.id,
      'transition changed scope');
    const applied = transition.outcome.status === 'applied';
    check(next.epoch === current.epoch && next.owner === current.owner && next.revision === current.revision + (applied ? 1 : 0),
      'transition changed fence or skipped revision');
    check(applied || (same(next, current) && !transition.observations.length && !transition.events.length), 'refused transition changed state');
    check(transition.events.length > 0 || same(next.world, current.world), 'world changed without event');
    capacity(record.counts, { receipts: terminal ? 0 : 1, observations: transition.observations.length,
      projections: transition.observations.length, events: transition.events.length });
    const result: DirectedReceipt = { request, result: transition.outcome, revision: next.revision,
      observationIds: transition.observations.map(value => value.id), eventIds: transition.events.map(value => value.id) };
    receipt(result, next);
    await appendHistory(tx, slot, record.counts, current, next, transition.observations, transition.events, Boolean(record.historyMode));
    await storeReceipt(tx, slot, record, result, terminal);
    record.session = next;
    await checkpoint(tx, slot, record);
    return result;
  });
}
export async function reconcileDirectedRequest(slot: string, input: DirectedRequest): Promise<DirectedReceipt | undefined> {
  id(slot);
  const request = snapshotRequest(input);
  return transaction(async tx => {
    const record = await load(tx, slot);
    return record ? originalReceipt(tx, slot, request, record) : undefined;
  });
}
export async function captureDirectedContext(slot: string, contextId: string, purpose: PresentedContext['purpose']): Promise<PresentedContext> {
  id(slot); id(contextId);
  check(purpose === 'human-view' || purpose === 'decision-fixture', 'invalid context purpose');
  return transaction(async tx => {
    const record = await requireSave(tx, slot);
    const rows = await tx.objectStore('contexts').getAll([slot, contextId], 1);
    if (rows.length) {
      context(rows[0], record.session);
      if (record.historyMode) {
        const value = rows[0], sequence = value.knowledgeRevision;
        await verifyWitness(tx, slot, 'contexts', contextId, value);
        const source = await tx.objectStore('observations').get([slot, sequence]);
        const knowledge = await tx.objectStore('projections').get([slot, sequence]);
        observation(source, record.session); projection(knowledge);
        await verifyWitness(tx, slot, 'observations', sequence, source);
        await verifyWitness(tx, slot, 'projections', sequence, knowledge);
        contextFromSource(value, knowledge, source, record.session.world.floorId);
      }
      check(rows[0].id === contextId && rows[0].purpose === purpose, 'context ID payload conflict');
      return rows[0];
    }
    capacity(record.counts, { contexts: 1 });
    const presented = presentDirected(structuredClone(record.session), contextId, purpose);
    context(presented, record.session);
    check(presented.id === contextId && presented.purpose === purpose, 'context identity mismatch');
    await tx.objectStore('contexts').add(presented, [slot, contextId]);
    if (record.historyMode) await witness(tx, slot, 'contexts', contextId, presented);
    record.counts.contexts++;
    await tx.objectStore('saves').put(record, slot);
    await saveHeadWitness(tx, slot, record);
    return presented;
  });
}
