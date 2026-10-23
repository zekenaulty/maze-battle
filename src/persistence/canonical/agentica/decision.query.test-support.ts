import { vi } from 'vitest';
import { canonicalJson, type HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import { mazeCapabilities } from '../../../services/agentica/game/capabilities';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalReceipt, CanonicalRecord, CanonicalRequest, Json, JsonObject } from '../types';
import { json } from '../world/records';
import { loadOriginalAction } from './actions.original';
import { retainActionResult } from './actions.result';
import { retainDecisionIntent } from './decision';
import { interactionDecisionFixture } from './decision.interaction.test-support';
import { eventKey } from './event.records';
import { assertLaunchGrant } from './launch.grant';
import { loadOperationBinding } from './operation.binding';
import { operationCustodyProbe } from './operation.probe';
import { retainPublication, readPublication } from './publication';
import { readRunGrantCertificate } from './run-grant.certificate';
import type { RunGrant, SuccessorGrant } from './run-grant.types';
import { loadAgenticaTerminalBase } from './terminal.base';
import { protocolAction } from './types.test-support';
import { prepareAction, snapshotPrepared } from './validation';
import type { DecisionQueryProof } from './decision.query.proof';

/** Real immutable records/receipts, decision projection, result writer and cleanup; upstream authority/terminal are fixture boundaries. */
export async function decisionQueryFixture(options: { initial?: boolean; adopted?: boolean; newerPublication?: boolean; source?: 'progress' | 'transfer' | 'probe'; padding?: number } = {}) {
  const f = await interactionDecisionFixture('navigation');
  const tx: CanonicalWork = { head: f.head, pages: f.pages, liveOperation: f.pages.liveOperation,
    setCheckpoint() { throw Error('Query cannot mutate checkpoint'); }, restoreSnapshot() { throw Error('Query cannot restore state'); } };
  let serial = 100;
  const request = (operation: string, input: unknown, revision = f.head.revision): CanonicalRequest => ({
    attemptId: `query-${++serial}`, operation, input: json(input), expected: { ...canonicalFence(f.head), revision }, deadlineAt: null,
  });
  function receipt(source: CanonicalRequest, result: Json): CanonicalReceipt {
    const value = { generation: f.head.generation, gameId: f.head.gameId, attemptId: source.attemptId,
      fingerprint: canonicalJson(source), beforeRevision: source.expected.revision, afterRevision: source.expected.revision + 1,
      committedAt: '2026-10-18T01:00:00.000Z', result: structuredClone(result) };
    f.receipts.set(source.attemptId, value); return value;
  }
  function row(key: string, kind: string, data: unknown, source: CanonicalRequest, launch = false) {
    const value: CanonicalRecord = { generation: f.head.generation, gameId: f.head.gameId, area: 'execution',
      key, id: `query-row-${++serial}`, revision: source.expected.revision + 1, indexes: [],
      value: json({ schema: 1, kind, ...(launch ? { launchId: 'launch' } : {}), sourceAttemptId: source.attemptId, data: structuredClone(data) }) };
    f.records.set(key, value); return value;
  }
  const material = { reason: 'unopened-chest', at: { level: 1, cell: { spaceId: 'room-earned', row: 2, column: 3 } },
    source: { sequence: 3, id: 'earned-sight', index: 2 } };
  const sourceKind = options.source ?? 'progress';
  const source = request(sourceKind === 'progress' ? 'navigation.advance'
    : sourceKind === 'transfer' ? 'agentica.operation.transfer' : 'agentica.operation.confirm', { action: f.identity.storageKey }, 17);
  const previous: HostOperationEvent = sourceKind === 'probe'
    ? operationCustodyProbe(f.terminal.bound.start.hostId, f.identity.action, f.terminal.bound.result, source.attemptId)
    : { ...structuredClone(f.terminal.event), kind: sourceKind === 'transfer' ? 'transfer' : 'progress',
    sequence: 2, eventId: source.attemptId, observation: { observationId: `event-${source.attemptId}`, revision: 18,
      observedAt: '2026-10-17T23:00:00.000Z', data: { scope: 'actor', source: material.source,
        navigation: { status: 'arrived', reason: 'material-discovery', notice: material },
        ...(options.padding ? { padding: 'x'.repeat(options.padding) } : {}) } } };
  const prefix = `agentica/operations/${f.identity.storageKey.slice(-64)}/`;
  const eventRow = row(sourceKind === 'progress' ? eventKey(f.identity, 1)
    : sourceKind === 'transfer' ? `${prefix}transfer/${source.attemptId}` : `${prefix}confirmation`,
  sourceKind === 'progress' ? 'agentica-operation-event' : sourceKind === 'transfer' ? 'agentica-transfer-intent' : 'agentica-operation-confirmation',
  sourceKind === 'probe' ? { probe: previous } : { event: previous }, source);
  const anchor = { key: eventRow.key, id: eventRow.id };
  receipt(source, sourceKind === 'progress'
    ? { host: { event: { key: eventRow.key, recordId: eventRow.id, revision: eventRow.revision,
      sourceAttemptId: source.attemptId, recordWitness: canonicalJson(eventRow) } } }
    : sourceKind === 'transfer' ? { transferIntent: { ...anchor, witness: canonicalJson(eventRow) }, transferTip: {} }
    : { agenticaOperation: { ...anchor, recordWitness: canonicalJson(eventRow) } });
  Object.assign(f.terminal.bound, { progress: { sequence: sourceKind === 'probe' ? 0 : 1 } });
  f.terminal.event.sequence = previous.sequence + 1;
  if (sourceKind === 'probe') f.terminal.event.usage = { steps: 0 };
  f.terminal.event.observation = structuredClone(previous.observation);
  if (sourceKind === 'transfer') Object.assign(f.terminal, { transfer: { reference: anchor, data: { navigationSequence: 1, event: previous } } });
  if (sourceKind === 'probe') f.terminal.confirmed!.reference = anchor;
  receipt(f.terminal.terminal.terminal.source, { operationId: f.terminal.event.operationId, status: 'arrived', sequence: 1 });
  vi.mocked(loadAgenticaTerminalBase).mockImplementation(async () => ({ ...structuredClone(f.terminal), identity: snapshotPrepared(f.identity) }));
  let publication = f.publication;
  if (options.adopted) {
    f.head.epoch = 2; f.head.owner = 'adopted-owner';
    const r = request('agentica.publish', {}), written = await retainPublication(tx, r);
    receipt(r, written.receipt); f.head.revision++; publication = written.reference;
  }
  const r = request('agentica.operation.decision', { action: f.identity.storageKey, binding: f.binding, publication });
  const written = await retainDecisionIntent(tx, r, f.identity, f.binding, publication);
  receipt(r, written.receipt); f.head.revision++;
  const intent = (await f.read())!;
  const grantRef = { key: options.initial ? 'agentica/launch/launch/grant' : `${intent.reference.key}/grant`, id: '' };
  const grantData = { run: { key: `${intent.reference.key}/claim`, id: 'claim' }, publication, owner: f.head.owner,
    epoch: f.head.epoch, guardRevision: 30, action: f.identity.storageKey, binding: f.binding, intent: intent.reference,
    original: f.terminal.bound.original.reference, result: f.terminal.bound.original.resultReference } as SuccessorGrant;
  const grantSource = request('agentica.decision.grant', { action: f.identity.storageKey });
  const grantRow = row(grantRef.key, options.initial ? 'agentica-launch-grant' : 'agentica-successor-grant', grantData, grantSource, true);
  grantRef.id = grantRow.id;
  receipt(grantSource, { launchRecords: [{ ...grantRef, witness: canonicalJson(grantRow) }] }); f.head.revision++;
  if (options.newerPublication) {
    const r = request('agentica.publish', {}), written = await retainPublication(tx, r);
    receipt(r, written.receipt); f.head.revision++; publication = written.reference;
  }
  const binding = { grant: grantRef, publication };
  const pub = await readPublication(f.pages, publication), identity = await prepareAction({ ...protocolAction(pub.wireRevision),
    actionId: 'query-action', sessionEpoch: String(f.head.epoch), arguments: { scope: 'decision' } });
  const pendingRequest = request('agentica.action.reserve', { action: identity.storageKey, ...binding });
  const pendingRow: CanonicalRecord = { ...grantRow, key: identity.storageKey, id: 'query-pending', revision: f.head.revision + 1,
    value: json({ schema: 1, kind: 'agentica-action', sourceAttemptId: pendingRequest.attemptId, sourceRequest: pendingRequest,
      owner: f.head.owner, epoch: f.head.epoch, key: identity.key, fingerprint: identity.fingerprint, action: identity.action,
      publication, effect: 'readOnly' }) };
  f.records.set(pendingRow.key, pendingRow);
  receipt(pendingRequest, { reference: { key: pendingRow.key, id: pendingRow.id }, recordId: pendingRow.id, recordWitness: canonicalJson(pendingRow) });
  f.head.revision++;
  const pending = (await loadOriginalAction(f.pages, identity))!;
  const authorized = { launchId: 'launch', run: {} as Awaited<ReturnType<typeof assertLaunchGrant>>['run'],
    capability: mazeCapabilities()[1], publication: pub };
  vi.mocked(assertLaunchGrant).mockImplementation(async () => structuredClone(authorized));
  const certified = { record: { ref: grantRef, row: grantRow, value: grantRow.value, source: grantSource },
    launch: { binding: { launchId: 'launch' } } } as unknown as RunGrant;
  const prior = { launch: { binding: { launchId: 'launch' } }, record: { row: { revision: 10 } } } as RunGrant;
  vi.mocked(readRunGrantCertificate).mockImplementation(async (_pages, ref) => structuredClone(ref.key === grantRef.key ? certified : prior));
  vi.mocked(loadOperationBinding).mockImplementation(async () => structuredClone(f.terminal.bound));
  async function store(result: Parameters<typeof retainActionResult>[3], proof?: DecisionQueryProof) {
    const r = request('agentica.action.resolve', { action: identity.storageKey });
    const written = await retainActionResult(tx, r, identity, result, undefined, undefined, proof);
    receipt(r, written.receipt); f.head.revision++; return written.reference;
  }
  return { ...f, tx, queryIdentity: identity, queryBinding: binding, intent, pending, authorized, certified, prior, eventRow, previous, store,
    // The original action restoration boundary is separately asserted in read tests.
    predecessor: f.identity, request, receipt, row, queryResultValue: () => f.records.get(`${identity.storageKey}/result`)!.value as JsonObject };
}
