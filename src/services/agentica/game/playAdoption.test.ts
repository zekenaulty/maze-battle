// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession } from '../../game/GameSession';
import { inspectPlayAdoption } from './playAdoption';
import { adoptionFixture } from './playAdoption.test-support';
import { deferred } from './transportGate';

const m = vi.hoisted(() => ({ database: vi.fn(), inspect: vi.fn(), state: vi.fn(), launch: vi.fn(), prepare: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: m.database }));
vi.mock('../../../persistence/canonical/agentica/recovery.inspect', () => ({ inspectAgenticaRecovery: m.inspect }));
vi.mock('../../../persistence/canonical/agentica/actions', () => ({ prepareAction: m.prepare }));
vi.mock('../../../persistence/canonical/agentica/launch', () => ({ readLaunch: m.launch }));
vi.mock('./decisionState', () => ({ decisionState: m.state }));
let fixture: ReturnType<typeof adoptionFixture>, session: GameSession, host: AbortController, scope: AbortController, database: AbortController;
let insideDatabase: boolean;
beforeEach(() => {
  vi.resetAllMocks(); fixture = adoptionFixture(); host = new AbortController(); scope = new AbortController(); database = new AbortController(); insideDatabase = false;
  session = { owner: fixture.fence.owner, get hostSignal() { return host.signal; },
    view: { controlled: true, game: { snapshot: fixture.fence } }, submitHostCommand: vi.fn(), cleanupHostOperation: vi.fn(), flush: vi.fn(),
    refresh: vi.fn(), execute: vi.fn() } as unknown as GameSession;
  m.database.mockImplementation(async (signal, read) => {
    signal.throwIfAborted(); insideDatabase = true;
    try { return await read(AbortSignal.any([signal, database.signal])); } finally { insideDatabase = false; }
  });
  m.inspect.mockImplementation(async () => { expect(insideDatabase).toBe(true); return fixture.inspected; });
  m.prepare.mockImplementation(async action => ({ action }));
  m.state.mockImplementation(async () => { expect(insideDatabase).toBe(true); return fixture.view; });
  m.launch.mockImplementation(async () => { expect(insideDatabase).toBe(true); return { head: fixture.view.head, value: fixture.launch }; });
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('Unexpected network'); }));
  vi.stubGlobal('WebSocket', vi.fn(() => { throw Error('Unexpected socket'); }));
});
afterEach(() => { vi.unstubAllGlobals(); });
const inspect = () => inspectPlayAdoption(session, fixture.fence, fixture.candidate, { signal: scope.signal });

describe('read-only new-owner adoption disclosure', () => {
  it('returns the exact retained profile and service allowance with bounded guarded reads, no effects', async () => {
    const offer = await inspect();
    expect(offer).toEqual({ fence: fixture.fence, candidate: fixture.candidate, launchId: 'launch', original: fixture.original,
      objective: fixture.launch.acceptedStart.objective,
      profile: { endpoint: fixture.launch.binding.endpoint, provider: fixture.entry.request.provider, limits: fixture.entry.request.limits },
      remainingContinuations: 3 });
    expect(m.database).toHaveBeenCalledOnce(); expect(m.inspect).toHaveBeenCalledExactlyOnceWith(fixture.fence, fixture.candidate, { signal: expect.any(AbortSignal) });
    expect(m.state).toHaveBeenCalledOnce(); expect(m.launch).toHaveBeenCalledExactlyOnceWith();
    expect(session.submitHostCommand).not.toHaveBeenCalled(); expect(session.cleanupHostOperation).not.toHaveBeenCalled();
    expect(session.flush).not.toHaveBeenCalled(); expect(session.refresh).not.toHaveBeenCalled(); expect(session.execute).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled();
    offer!.profile.provider.model = 'changed'; offer!.original.binding.grant.id = 'changed';
    expect(fixture.entry.request.provider.model).toBe('resolved-fixture'); expect(fixture.original.binding.grant.id).toBe('original-grant');
  });

  it('uses the validated effective allowance, without decrementing for an adoption not yet attempted', async () => {
    fixture.entry.request.limits.maxPlanContinuations = 2;
    expect((await inspect())!.remainingContinuations).toBe(1);
    fixture.entry.request.limits.maxPlanContinuations = 1;
    expect(await inspect()).toBeNull();
  });

  it('permits a prior-transfer event older than the current owner, not just the original action epoch', async () => {
    fixture.fence.epoch = 3; fixture.view.head.epoch = 3;
    fixture.view.value.terminal.event.sessionEpoch = '2'; fixture.launch.guard.epoch = 2;
    expect((await inspect())!.remainingContinuations).toBe(3);
    fixture.view.value.terminal.event.sessionEpoch = '3';
    expect(await inspect()).toBeNull();
  });

  it('does not offer an already-current root lacking the later decision-specific guard receipt', async () => {
    fixture.launch.guard.owner = fixture.fence.owner; fixture.launch.guard.epoch = fixture.fence.epoch;
    expect(await inspect()).toBeNull();
  });

  it('permits intermediate generic root custody and a returning original owner at a newer epoch', async () => {
    fixture.fence.epoch = fixture.view.head.epoch = 3;
    fixture.launch.guard.owner = 'intermediate-owner'; fixture.launch.guard.epoch = 2;
    fixture.view.value.terminal.bound.grant.value.data.owner = fixture.fence.owner;
    expect(await inspect()).not.toBeNull();
    // Same owner with an older epoch still needs, and can commit, the new decision guard receipt.
    fixture.launch.guard.owner = fixture.fence.owner; expect(await inspect()).not.toBeNull();
  });

  it('permits manual movement before a fresh exact fence inspection, but rejects the old offer fence', async () => {
    const old = structuredClone(fixture.fence); fixture.fence.revision++; fixture.view.head.revision++;
    expect(await inspect()).not.toBeNull();
    await expect(inspectPlayAdoption(session, old, fixture.candidate)).rejects.toThrow('inspection changed');
  });

  it.each(['uncontrolled', 'busy', 'recovery'])('does not open storage when %s', async reason => {
    if (reason === 'uncontrolled') session.view.controlled = false;
    if (reason === 'busy') session.view.busy = true;
    if (reason === 'recovery') session.view.recoveryRequired = true;
    expect(await inspect()).toBeNull(); expect(m.database).not.toHaveBeenCalled();
  });

  it.each(['acknowledged', 'cancelled', 'intent', 'claim', 'unconfirmed', 'root-settled', 'same-epoch', 'steps', 'refinements'])
  ('does not offer legitimately ineligible %s evidence', async reason => {
    const t = fixture.view.value.terminal;
    if (reason === 'acknowledged') fixture.inspected.operation.state = 'acknowledged';
    if (reason === 'cancelled') fixture.inspected.terminal.event.kind = 'cancelled';
    if (reason === 'intent') fixture.view.value.decision = {} as never;
    if (reason === 'claim') fixture.view.value.claim = {} as never;
    if (reason === 'unconfirmed') t.confirmed = null;
    if (reason === 'root-settled') t.bound.launch.guard.state = 'settled';
    if (reason === 'same-epoch') { fixture.fence.epoch = 1; fixture.view.head.epoch = 1; }
    if (reason === 'steps') fixture.entry.usage.steps = fixture.entry.request.limits.maxSteps;
    if (reason === 'refinements') fixture.entry.usage.refinements = fixture.entry.request.limits.maxRefinements + 1;
    expect(await inspect()).toBeNull(); expect(m.launch).not.toHaveBeenCalled();
  });

  it.each(['candidate', 'owner', 'fence', 'future-epoch', 'epoch-source', 'selected', 'publication', 'root', 'root-source', 'root-past', 'root-future', 'original', 'usage', 'entry-action'])
  ('fails closed on mismatched %s evidence', async reason => {
    const t = fixture.view.value.terminal;
    if (reason === 'candidate') fixture.inspected.candidate = { ...fixture.candidate, operationId: 'foreign' };
    if (reason === 'owner') fixture.fence.owner = 'foreign';
    if (reason === 'fence') fixture.view.head.revision++;
    if (reason === 'future-epoch') t.event.sessionEpoch = '3';
    if (reason === 'epoch-source') t.bound.grant.value.data.epoch = 2;
    if (reason === 'selected') fixture.view.value.selected!.value.data = { ...fixture.original.binding, grant: { key: 'agentica/other', id: 'other' } } as never;
    if (reason === 'publication') fixture.view.value.selected!.value.data = { ...fixture.original.binding, publication: { key: 'agentica/other', id: 'other' } } as never;
    if (reason === 'root') t.bound.active!.id = 'foreign';
    if (reason === 'root-source') t.bound.active!.sourceAttemptId = 'foreign';
    if (reason === 'root-past') fixture.launch.guard.epoch = 0;
    if (reason === 'root-future') fixture.launch.guard.epoch = 3;
    if (reason === 'original') t.identity = { ...t.identity, action: { ...fixture.original.action, actionId: 'foreign' } };
    if (reason === 'usage') fixture.entry.usage.continuations = -1;
    if (reason === 'entry-action') fixture.entry.action = { ...fixture.original.action, actionId: 'foreign' };
    await expect(inspect()).rejects.toThrow();
  });

  it.each(['missing', 'obsolete'])('does not reach ordinary readers if %s database is refused', async reason => {
    m.database.mockRejectedValueOnce(new Error(`Recovery ${reason} database`));
    await expect(inspect()).rejects.toThrow(reason); expect(m.inspect).not.toHaveBeenCalled(); expect(m.state).not.toHaveBeenCalled(); expect(m.launch).not.toHaveBeenCalled();
  });

  it('propagates corrupt source proof instead of calling it ineligible', async () => {
    m.inspect.mockRejectedValueOnce(new Error('Corrupt source receipt')); await expect(inspect()).rejects.toThrow('Corrupt source receipt');
  });

  it.each(['fence', 'root', 'missing'])('rejects a changed final %s read', async reason => {
    m.launch.mockResolvedValueOnce({ head: { ...fixture.view.head, ...(reason === 'fence' ? { revision: 31 } : {}) },
      value: reason === 'missing' ? null : { ...fixture.launch, ...(reason === 'root' ? { binding: { ...fixture.launch.binding, launchId: 'other' } } : {}) } });
    await expect(inspect()).rejects.toThrow('active root or fence');
  });

  it.each(['inspect', 'state', 'launch'])('rejects late %s results after Stop', async stage => {
    const pending = deferred<unknown>(), entered = deferred<void>(), read = m[stage as 'inspect' | 'state' | 'launch'];
    const implementation = read.getMockImplementation()!;
    read.mockImplementationOnce(async (...args) => { entered.resolve(); await pending.promise; return implementation(...args); });
    const result = inspect(), failure = expect(result).rejects.toThrow(); await entered.promise;
    host.abort(); pending.resolve(undefined); await failure;
  });

  it.each(['caller', 'schema', 'lifetime', 'control', 'game'])('rejects %s change during a read', async reason => {
    const read = m.state.getMockImplementation()!;
    m.state.mockImplementationOnce(async () => {
      if (reason === 'caller') scope.abort(); if (reason === 'schema') database.abort();
      if (reason === 'lifetime') host = new AbortController(); if (reason === 'control') session.view.controlled = false;
      if (reason === 'game') session.view.game!.snapshot = { ...session.view.game!.snapshot, gameId: 'new-game' };
      return read();
    });
    await expect(inspect()).rejects.toThrow(); expect(m.launch).not.toHaveBeenCalled();
  });
});
