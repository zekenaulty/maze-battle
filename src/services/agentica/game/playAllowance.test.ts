// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession } from '../../game/GameSession';
import { readPlayDecisionAllowance } from './playAllowance';
import { adoptionFixture } from './playAdoption.test-support';
import { deferred } from './transportGate';

const m = vi.hoisted(() => ({ database: vi.fn(), state: vi.fn(), prepare: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: m.database }));
vi.mock('../../../persistence/canonical/agentica/actions', () => ({ prepareAction: m.prepare }));
vi.mock('./decisionState', () => ({ decisionState: m.state }));
let fixture: ReturnType<typeof adoptionFixture>, session: GameSession, host: AbortController, scope: AbortController, schema: AbortController;
beforeEach(() => {
  vi.resetAllMocks(); fixture = adoptionFixture(); host = new AbortController(); scope = new AbortController(); schema = new AbortController();
  fixture.fence.owner = fixture.view.head.owner = 'owner'; fixture.fence.epoch = fixture.view.head.epoch = 1;
  session = { owner: 'owner', get hostSignal() { return host.signal; }, view: { controlled: true, game: { snapshot: { ...fixture.fence } } },
    submitHostCommand: vi.fn(), cleanupHostOperation: vi.fn(), flush: vi.fn(), refresh: vi.fn(), execute: vi.fn() } as unknown as GameSession;
  let insideDatabase = false;
  m.database.mockImplementation(async (signal, read) => {
    signal.throwIfAborted(); insideDatabase = true;
    try { return await read(AbortSignal.any([signal, schema.signal])); } finally { insideDatabase = false; }
  });
  m.prepare.mockImplementation(async action => ({ action }));
  m.state.mockImplementation(async () => { expect(insideDatabase).toBe(true); return fixture.view; });
  vi.stubGlobal('fetch', vi.fn()); vi.stubGlobal('WebSocket', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); });
const read = () => readPlayDecisionAllowance(session, fixture.original, { signal: scope.signal });

describe('retained same-owner decision allowance', () => {
  it('uses one guarded canonical decision read and service usage, without queue, world, or network effects', async () => {
    expect(await read()).toBe(3); expect(m.state).toHaveBeenCalledExactlyOnceWith({ action: fixture.original.action }, fixture.original.binding);
    expect(m.database).toHaveBeenCalledOnce(); expect(session.submitHostCommand).not.toHaveBeenCalled();
    expect(session.cleanupHostOperation).not.toHaveBeenCalled(); expect(session.flush).not.toHaveBeenCalled();
    expect(session.refresh).not.toHaveBeenCalled(); expect(session.execute).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled();
  });

  it.each(['continuations', 'steps', 'refinements'])('reports zero for exhausted %s', async key => {
    if (key === 'continuations') fixture.entry.usage.continuations = fixture.entry.request.limits.maxPlanContinuations + 1;
    if (key === 'steps') fixture.entry.usage.steps = fixture.entry.request.limits.maxSteps;
    if (key === 'refinements') fixture.entry.usage.refinements = fixture.entry.request.limits.maxRefinements + 1;
    expect(await read()).toBe(0);
  });

  it('allows the last continuation and exact refinement limit; reads newly retained usage instead of a local decrement', async () => {
    fixture.entry.usage.refinements = fixture.entry.request.limits.maxRefinements;
    fixture.entry.usage.continuations = 3; expect(await read()).toBe(1);
    fixture.entry.usage.continuations = 4; expect(await read()).toBe(0);
  });

  it.each(['uncontrolled', 'busy', 'recovery', 'caller-abort', 'host-abort'])('refuses %s before opening storage', async reason => {
    if (reason === 'uncontrolled') session.view.controlled = false;
    if (reason === 'busy') session.view.busy = true;
    if (reason === 'recovery') session.view.recoveryRequired = true;
    if (reason === 'caller-abort') scope.abort(); if (reason === 'host-abort') host.abort();
    await expect(read()).rejects.toThrow(); expect(m.database).not.toHaveBeenCalled();
  });

  it.each(['fence', 'owner', 'epoch', 'event-epoch', 'grant-owner', 'root-owner', 'root', 'root-source', 'root-state',
    'selected', 'publication', 'intent', 'claim', 'grant', 'acknowledged', 'unconfirmed', 'original', 'usage', 'entry-action'])
  ('does not present mismatched %s as merely zero allowance', async reason => {
    const t = fixture.view.value.terminal;
    if (reason === 'fence') fixture.view.head.revision++;
    if (reason === 'owner') fixture.view.head.owner = 'foreign';
    if (reason === 'epoch') fixture.view.head.epoch++;
    if (reason === 'event-epoch') t.event.sessionEpoch = '2';
    if (reason === 'grant-owner') t.bound.grant.value.data.owner = 'foreign';
    if (reason === 'root-owner') fixture.launch.guard.owner = 'foreign';
    if (reason === 'root') t.bound.active!.id = 'foreign';
    if (reason === 'root-source') t.bound.active!.sourceAttemptId = 'foreign';
    if (reason === 'root-state') t.bound.launch.guard.state = 'acknowledged';
    if (reason === 'selected') fixture.view.value.selected = null;
    if (reason === 'publication') fixture.view.value.selected!.value.data = { ...fixture.original.binding, publication: { key: 'agentica/other', id: 'other' } } as never;
    if (reason === 'intent') fixture.view.value.decision = {} as never;
    if (reason === 'claim') fixture.view.value.claim = {} as never;
    if (reason === 'grant') fixture.view.value.grant = {} as never;
    if (reason === 'acknowledged') t.bound.operation.state = 'acknowledged';
    if (reason === 'unconfirmed') t.confirmed = null;
    if (reason === 'original') t.identity = { ...t.identity, action: { ...fixture.original.action, actionId: 'foreign' } };
    if (reason === 'usage') fixture.entry.usage.continuations = NaN;
    if (reason === 'entry-action') fixture.entry.action = { ...fixture.original.action, actionId: 'foreign' };
    await expect(read()).rejects.toThrow();
  });

  it.each(['missing', 'obsolete'])('does not reach an ordinary reader for a %s database', async reason => {
    m.database.mockRejectedValueOnce(new Error(reason));
    await expect(read()).rejects.toThrow(reason); expect(m.state).not.toHaveBeenCalled();
  });

  it.each(['caller', 'host', 'schema', 'lifetime', 'game', 'revision', 'control'])('refuses a late result after %s change', async reason => {
    const pending = deferred<unknown>(); m.state.mockReturnValueOnce(pending.promise);
    const result = read(), rejected = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(m.state).toHaveBeenCalledOnce());
    if (reason === 'caller') scope.abort(); if (reason === 'host') host.abort(); if (reason === 'schema') schema.abort();
    if (reason === 'lifetime') host = new AbortController();
    if (reason === 'game') session.view.game!.snapshot.gameId = 'other';
    if (reason === 'revision') session.view.game!.snapshot.revision++;
    if (reason === 'control') session.view.controlled = false;
    pending.resolve(fixture.view); await rejected;
  });

  it('captures nested caller inputs before yielding', async () => {
    const pending = deferred<unknown>(), input = structuredClone(fixture.original);
    m.prepare.mockReturnValueOnce(pending.promise);
    const result = readPlayDecisionAllowance(session, input);
    await vi.waitFor(() => expect(m.prepare).toHaveBeenCalledOnce());
    input.action.arguments.changed = true; input.binding.grant.id = 'changed';
    pending.resolve({ action: fixture.original.action }); expect(await result).toBe(3);
    expect(m.state.mock.calls[0][1]).toEqual(fixture.original.binding);
  });
});
