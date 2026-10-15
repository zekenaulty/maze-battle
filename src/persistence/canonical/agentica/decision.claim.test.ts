// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AgenticaOperationEntry, HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import { canonicalFence } from '../transaction';
import { gameCheckpoint } from '../game/checkpoint';
import { validateDecisionClaim } from './decision.claim';
import { decisionAdoption, decisionEvent, type RetainedDecision } from './decision.records';
import { launchStartFixture, launchStartedFixture } from './launch.test-support';
import { protocolAction, protocolHead, protocolResult } from './types.test-support';
import type { Publication } from './types';

function fixture(adopt = false) {
  const head = protocolHead(); head.revision = 12; if (adopt) head.epoch++;
  const action = { ...protocolAction(), capabilityId: 'maze.navigate' }, admission = protocolResult(action);
  admission.operation = { operationId: 'navigation', summary: 'Local travel' };
  const start = launchStartFixture(), usage = { steps: 2, refinements: 1, continuations: 0, providerCalls: 2 };
  const terminal: HostOperationEvent = { hostId: 'maze-battle', sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
    actionId: action.actionId, operationId: 'navigation', sequence: 4, eventId: 'terminal', kind: 'decision',
    observation: admission.observation!, summary: 'Destination reached', usage: { steps: 3, replans: 0 } };
  const publication: Publication = { schema: 1, kind: 'agentica-publication', sourceAttemptId: 'publish', owner: head.owner, epoch: head.epoch,
    sourceRequest: { operation: 'agentica.publish', input: {}, attemptId: 'publish', expected: canonicalFence(head), deadlineAt: null },
    wireRevision: head.revision, observation: gameCheckpoint(head.checkpoint).knowledge,
    snapshot: { generation: head.generation, gameId: head.gameId, revision: head.revision, checkpoint: head.checkpoint,
      roots: { world: head.roots.world, knowledge: head.roots.knowledge } } };
  const event = decisionEvent(publication, terminal, 'intention'), adoption = decisionAdoption(publication, terminal, 'intention');
  const started = launchStartedFixture({ ...start, sessionEpoch: String(head.epoch) }, 'successor');
  const decision = { reference: { key: 'intent', id: 'record' }, identity: { action }, data: { event, adoption },
    terminal: { bound: { start, result: admission }, confirmed: { data: { entry: { usage } } } },
  } as unknown as RetainedDecision;
  const entry: AgenticaOperationEntry = { request: start, action, admission, activeEpoch: String(head.epoch), state: 'waking',
    usage, latestEvent: event, wakeRunId: started.runId, ...(adoption ? { wakeAdoption: adoption } : {}) };
  return { decision, started, entry, publication, terminal };
}

describe('retained decision successor claims', () => {
  it.each([false, true])('requires exact original scope and cumulative admission usage (adopt=%s)', adopt => {
    const f = fixture(adopt), original = structuredClone(f);
    expect(validateDecisionClaim(f.decision, f.started, f.entry)).toEqual({ intent: f.decision.reference, started: f.started, usage: f.entry.usage,
      state: 'waking', settledUsage: null, stopped: false });
    expect(f).toEqual(original);
  });
  it('renews same-epoch observation explicitly without rewriting the terminal receipt', () => {
    const f = fixture(); expect(f.decision.data.adoption).toBeNull();
    expect(f.decision.data.event.eventId).toBe('intention');
    expect(f.decision.data.event.observation).toMatchObject({ observationId: 'decision-intention', revision: 12,
      observedAt: gameCheckpoint(f.publication.snapshot.checkpoint).updatedAt });
    expect(f.terminal.eventId).toBe('terminal'); expect(f.terminal.observation.revision).toBe(7);
  });
  it('keeps old-epoch evidence intact and places fresh evidence only in explicit adoption', () => {
    const f = fixture(true); expect(f.decision.data.event).toEqual(f.terminal);
    expect(f.decision.data.adoption).toMatchObject({ adoptionId: 'intention', nextSessionEpoch: '2',
      observation: { observationId: 'decision-intention', revision: 12 } });
    expect(() => decisionAdoption({ ...f.publication, epoch: 1 }, { ...f.terminal, sessionEpoch: '2' }, 'intent')).toThrow('rewinds');
  });
  it('accepts typed service UTC serialization without normalizing arbitrary evidence', () => {
    const f = fixture(true), remote = structuredClone(f.entry);
    remote.wakeAdoption!.observation.observedAt = remote.wakeAdoption!.observation.observedAt.replace('.000Z', '.0000000+00:00');
    expect(() => validateDecisionClaim(f.decision, f.started, remote)).not.toThrow();
    remote.wakeAdoption!.observation.data.extra = null;
    expect(() => validateDecisionClaim(f.decision, f.started, remote)).toThrow();
  });
  it.each(['continued', 'completed', 'blocked', 'cancelled'])('retains a successor that already became %s before reconciliation', state => {
    const f = fixture(); f.entry.state = state;
    const settledUsage = { ...f.entry.usage, continuations: 1, providerCalls: 3 };
    Object.assign(f.entry, { settledUsage });
    expect(validateDecisionClaim(f.decision, f.started, f.entry)).toMatchObject({ state, settledUsage });
  });
  it('retains exact stopped-decision custody without inventing known settlement usage', () => {
    const f = fixture(); f.entry.state = 'cancelled'; f.entry.stopDecision = f.entry.latestEvent;
    expect(validateDecisionClaim(f.decision, f.started, f.entry)).toMatchObject({ state: 'cancelled', stopped: true, settledUsage: null });
    f.entry.stopDecision = { ...f.entry.latestEvent!, eventId: 'other-stop' };
    expect(() => validateDecisionClaim(f.decision, f.started, f.entry)).toThrow('stop changed');
  });
  it.each(['steps', 'refinements', 'continuations', 'providerCalls'])('rejects decreasing settlement %s', field => {
    const f = fixture(); f.entry.state = 'completed';
    Object.assign(f.entry, { settledUsage: { ...f.entry.usage, continuations: 1, [field]: -1 } });
    expect(() => validateDecisionClaim(f.decision, f.started, f.entry)).toThrow('settlement usage');
  });
  it('requires the claimed continuation in otherwise nondecreasing settlement totals', () => {
    const f = fixture(); f.entry.state = 'completed'; Object.assign(f.entry, { settledUsage: f.entry.usage });
    expect(() => validateDecisionClaim(f.decision, f.started, f.entry)).toThrow('settlement usage');
  });
  it.each(['run', 'manifest', 'scope', 'objective', 'epoch', 'provider', 'limits', 'action', 'admission', 'event', 'usage', 'state', 'adoption', 'settled'])
  ('refuses changed %s without constructing a replacement run', field => {
    const f = fixture(true);
    if (field === 'run') f.entry.wakeRunId = 'different';
    if (field === 'manifest') f.started.manifestHash = `sha256:${'b'.repeat(64)}`;
    if (field === 'scope') f.started.scopeId = 'different';
    if (field === 'objective') f.started.objectiveId = 'different';
    if (field === 'epoch') f.entry.activeEpoch = '1';
    if (field === 'provider') f.entry.request = { ...f.entry.request, provider: { ...f.entry.request.provider, provider: 'openai' } };
    if (field === 'limits') f.entry.request = { ...f.entry.request, limits: { ...f.entry.request.limits, maxSteps: 99 } };
    if (field === 'action') f.entry.action = { ...f.entry.action, actionId: 'different' };
    if (field === 'admission') f.entry.admission = { ...f.entry.admission!, evidenceId: 'different' };
    if (field === 'event') f.entry.latestEvent = { ...f.entry.latestEvent!, eventId: 'different' };
    if (field === 'usage') f.entry.usage = { ...f.entry.usage, providerCalls: 0 };
    if (field === 'state') f.entry.state = 'continued';
    if (field === 'adoption') f.entry.wakeAdoption = { ...f.entry.wakeAdoption!, adoptionId: 'different' };
    if (field === 'settled') Object.assign(f.entry, { settledUsage: f.entry.usage });
    expect(() => validateDecisionClaim(f.decision, f.started, f.entry)).toThrow();
  });
});
