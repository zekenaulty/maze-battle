import { expect } from 'vitest';
import { canonicalJson, type AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalPages } from '../pages';
import { validateReceipt } from '../receipts';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalReceipt, CanonicalRecord, CanonicalRequest, Json, JsonObject } from '../types';
import { json } from '../world/records';
import { retainDecisionIntent } from './decision';
import { retainDecisionClaim } from './decision.claim';
import { loadDecisionIntent } from './decision.records';
import { launchStartFixture, launchStartedFixture } from './launch.test-support';
import type { OperationRead } from './operation.types';
import { retainPublication } from './publication';
import { terminalAcknowledgement, type TerminalDelivery } from './terminal.ack';
import type { AgenticaTerminal } from './terminal.base';
import { decisionHandoffEvidence } from './terminal.decision';
import { decisionRootStopEvidence } from './terminal.root-stop';
import type { ProtocolWrite } from './types';
import { protocolAction, protocolHead, protocolResult } from './types.test-support';
import { prepareAction } from './validation';

/** Upstream terminal/launch evidence is supplied at its validated boundary; all decision and ACK validators stay real. */
export async function interactionDecisionFixture(kind: 'interaction' | 'navigation' = 'interaction') {
  const head = protocolHead(); head.revision = 30;
  const identity = await prepareAction({ ...protocolAction(), capabilityId: kind === 'interaction' ? 'maze.interact' : 'maze.navigate' });
  const scope = { generation: head.generation, gameId: head.gameId }, operationId = `${kind === 'interaction' ? 'interact' : 'travel'}-${identity.storageKey.slice(-64)}`;
  const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/publications/original', id: 'original-publication' } };
  const start = launchStartFixture(), result = { ...protocolResult(identity.action), operation: { operationId, summary: 'Retained admission' } };
  const usage = { steps: 2, refinements: 1, continuations: 0, providerCalls: 2 };
  let records = new Map<string, CanonicalRecord>(), receipts = new Map<string, CanonicalReceipt>(), serial = 0;
  const makeRequest = (operation: string, input: unknown): CanonicalRequest => ({ attemptId: `attempt-${++serial}`,
    operation, input: json(input), expected: canonicalFence(head), deadlineAt: null });
  function commit(request: CanonicalRequest, result: Json) {
    const receipt: CanonicalReceipt = { ...scope, attemptId: request.attemptId, fingerprint: canonicalJson(request),
      beforeRevision: request.expected.revision, afterRevision: request.expected.revision + 1,
      committedAt: '2026-10-18T00:00:00.000Z', result: structuredClone(result) };
    validateReceipt(receipt, scope, request); receipts.set(request.attemptId, receipt); head.revision = receipt.afterRevision;
    return structuredClone(receipt);
  }
  const terminalSource = { ...makeRequest('operation.settle', { operationId, disposition: kind === 'interaction' ? 'decision' : 'completed' }),
    expected: { ...canonicalFence(head), revision: 19 } };
  const terminal = { identity, binding, bound: { kind, binding, start, result,
    original: { reference: { key: identity.storageKey, id: 'original' }, resultReference: { key: `${identity.storageKey}/result`, id: 'result' } },
    operation: { ...scope, id: operationId, state: 'settled', ackPolicy: 'verified-host' },
    launch: { binding: { launchId: 'launch' }, guard: { ...scope, id: 'agentica-launch:launch', state: 'admitted',
      admissionAttemptId: 'root-admit', owner: head.owner, epoch: head.epoch } }, active: { id: 'launch', sourceAttemptId: 'root-admit' } },
    confirmed: { reference: { key: 'agentica/confirmation', id: 'confirmation' }, data: { entry: { usage } } },
    terminal: { disposition: kind === 'interaction' ? 'decision' : 'completed', terminal: {
      source: terminalSource, receipt: { afterRevision: 20 } } },
    event: { hostId: start.hostId, sessionId: identity.action.sessionId, sessionEpoch: identity.action.sessionEpoch,
      actionId: identity.action.actionId, operationId, sequence: 3, eventId: terminalSource.attemptId, kind: 'decision',
      observation: { ...result.observation!, revision: 20 }, summary: 'Explicit decision required.', usage: kind === 'interaction' ? {} : { steps: 3 } },
    transfer: null, probe: null, previous: null, predecessor: null,
  } as unknown as AgenticaTerminal;
  const pages = {
    async get(area: string, key: string) { expect(area).toBe('execution'); return structuredClone(records.get(key)); },
    async set(area: string, key: string, value: Json) {
      expect(area).toBe('execution');
      const row = { ...scope, area: 'execution' as const, key, value: structuredClone(value), indexes: [], id: `row-${++serial}`, revision: head.revision + 1 };
      records.set(key, row); return structuredClone(row);
    },
    async witness(area: string) { expect(area).toBe('knowledge'); return null; },
    async sourceReceipt(id: string) {
      const receipt = receipts.get(id), source = validateReceipt(receipt, scope);
      expect(receipt!.attemptId).toBe(id); return structuredClone({ source, receipt: receipt! });
    },
    async savedSnapshot(key: string) {
      const record = records.get(key)!, value = record.value as JsonObject;
      const { source, receipt } = await pages.sourceReceipt(value.sourceAttemptId as string);
      expect(receipt.result).toMatchObject({ snapshotRecordId: record.id, snapshotWitness: canonicalJson(record) });
      return structuredClone({ record, source, snapshot: value.snapshot });
    },
    async liveOperation() { throw Error('Unexpected kernel operation read outside terminal fixture'); },
  } as unknown as CanonicalPages & OperationRead;
  const tx = { head, pages, liveOperation: pages.liveOperation,
    setCheckpoint() { throw Error('Decision evidence must not change the checkpoint'); },
    restoreSnapshot() { throw Error('Decision evidence must not restore the world'); },
  } as CanonicalWork;
  async function write(operation: string, input: unknown, work: (request: CanonicalRequest) => Promise<ProtocolWrite>) {
    const request = makeRequest(operation, input), written = await work(request);
    commit(request, written.receipt); return written.reference;
  }
  const publication = await write('agentica.publish', {}, request => retainPublication(tx, request));
  const read = () => loadDecisionIntent(pages, identity);
  async function intent() {
    return write('agentica.operation.decision', { action: identity.storageKey, binding, publication },
      request => retainDecisionIntent(tx, request, identity, binding, publication));
  }
  async function remote(claimed = true): Promise<AgenticaOperationEntry> {
    const decision = (await read())!;
    return { request: start, action: identity.action, admission: result, activeEpoch: identity.action.sessionEpoch,
      state: claimed ? 'waking' : 'cancelled', usage, latestEvent: decision.data.event,
      ...(claimed ? { wakeRunId: 'successor' } : { stopDecision: decision.data.event }) };
  }
  async function claim(entry: AgenticaOperationEntry) {
    const intent = (await read())!.reference, started = launchStartedFixture(start, 'successor', identity.action.manifestHash);
    return write('agentica.operation.decision-claim', { action: identity.storageKey, intent, started, entry },
      request => retainDecisionClaim(tx, request, identity, intent, started, entry));
  }
  function stopRoot() {
    const guard = terminal.bound.launch.guard, cancel = makeRequest('operation.cancel', { operationId: guard.id });
    commit(cancel, { operationId: guard.id, phase: 'cancel' });
    guard.terminal = { disposition: 'cancelled', attemptId: cancel.attemptId }; guard.state = 'acknowledged';
    const ack = makeRequest('operation.ack', { operationId: guard.id, terminalAttemptId: cancel.attemptId, proof: {} });
    commit(ack, { operationId: guard.id, phase: 'ack' }); guard.acknowledgementAttemptId = ack.attemptId;
  }
  async function ack(entry: AgenticaOperationEntry, delivery: Extract<TerminalDelivery, 'decision-handoff' | 'decision-root-stop'>) {
    const evidence = await (delivery === 'decision-handoff' ? decisionHandoffEvidence : decisionRootStopEvidence)(pages, terminal, entry);
    const proof = json({ schema: 1, delivery, action: identity.storageKey, original: terminal.bound.original.reference,
      result: terminal.bound.original.resultReference, event: terminal.event, ...evidence });
    const request = makeRequest('operation.ack', { operationId, terminalAttemptId: terminalSource.attemptId, proof });
    await terminalAcknowledgement(identity, binding, entry, delivery).verify(pages, request);
    commit(request, { operationId, phase: 'ack' });
    terminal.bound.operation.state = 'acknowledged'; terminal.bound.operation.acknowledgementAttemptId = request.attemptId;
    return { request, evidence };
  }
  return { head, pages, identity, binding, terminal, publication, intent, read, remote, claim, stopRoot, ack,
    get records() { return records; }, get receipts() { return receipts; },
    reload() { records = structuredClone(records); receipts = structuredClone(receipts); },
  };
}
