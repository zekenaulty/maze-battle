// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m, run, drain, hold, notice, options, sdk, session, scope, host, view, update, onDecision, fail,
  original, successorAction, successorBinding, result, driverClose } from './playDecision.test-support';
import { adoptionFixture } from './playAdoption.test-support';
import { launchStartedFixture } from '../../../persistence/canonical/agentica/launch.test-support';
import { createGameDecisionController } from './decisionController';

const adoptedAction = { ...successorAction, sessionEpoch: '2' };
beforeEach(() => {
  const fixture = adoptionFixture(); Object.assign(view, fixture.view);
  const adopted = launchStartedFixture({ ...fixture.entry.request, sessionEpoch: '2' }, adoptedAction.runId);
  sdk.adoptDecision.mockResolvedValue(adopted);
  m.prepare.mockImplementation(async () => {
    view.value.decision = { reference: { key: 'agentica/decision', id: 'decision' }, terminal: view.value.terminal,
      data: { event: { sessionEpoch: view.value.terminal.event.sessionEpoch },
        adoption: { nextSessionEpoch: String(view.head.epoch), adoptionId: 'adoption' }, publication: successorBinding.publication } };
  });
  m.claim.mockImplementation(async () => { view.value.claim = { data: { started: adopted, state: 'waking' }, decision: view.value.decision }; });
  m.adopt.mockImplementation(async () => { const guard = view.value.terminal.bound.launch.guard; guard.owner = view.head.owner; guard.epoch = view.head.epoch; });
});

describe('explicit mounted new-owner adoption', () => {
  it('requires explicit mode; default cannot publish or connect for a foreign original', async () => {
    run(); await drain(); expect(fail).toHaveBeenCalledOnce(); expect(m.publication).not.toHaveBeenCalled(); expect(sdk.connect).not.toHaveBeenCalled();
  });

  it('requires an existing current database before reading an adoption source', async () => {
    m.database.mockRejectedValueOnce(new Error('Recovery requires the existing schema'));
    run({ mode: 'adopt' }); await drain(); expect(fail).toHaveBeenCalledOnce(); expect(m.state).not.toHaveBeenCalled();
    expect(m.publication).not.toHaveBeenCalled(); expect(sdk.connect).not.toHaveBeenCalled();
  });

  it('adopts the retained transfer event epoch, not the original action epoch', async () => {
    view.head.epoch = 3; view.value.terminal.event.sessionEpoch = '2'; view.value.terminal.bound.launch.guard.epoch = 2;
    sdk.adoptDecision.mockResolvedValueOnce(launchStartedFixture({ ...adoptionFixture().entry.request, sessionEpoch: '3' }, successorAction.runId));
    run({ mode: 'adopt' }); await vi.advanceTimersByTimeAsync(750);
    expect(sdk.adoptDecision).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessionEpoch: '2' }), expect.objectContaining({ nextSessionEpoch: '3' }));
    expect(sdk.wakeOperation).not.toHaveBeenCalled(); expect(m.grant).toHaveBeenCalledOnce(); expect(fail).not.toHaveBeenCalled();
  });

  it('refuses a generically adopted current root before publishing or spending service work', async () => {
    view.value.terminal.bound.launch.guard.owner = view.head.owner; view.value.terminal.bound.launch.guard.epoch = view.head.epoch;
    run({ mode: 'adopt' }); await drain(); expect(fail).toHaveBeenCalledOnce();
    expect(m.publication).not.toHaveBeenCalled(); expect(sdk.connect).not.toHaveBeenCalled(); expect(sdk.adoptDecision).not.toHaveBeenCalled();
  });

  it('uses normal claim and root adoption before granting, ACKs once, then returns only the real next decision', async () => {
    run({ mode: 'adopt' }); await vi.advanceTimersByTimeAsync(500);
    expect(m.claim).toHaveBeenCalledOnce(); expect(m.adopt).toHaveBeenCalledOnce(); expect(m.grant).not.toHaveBeenCalled();
    const delivery = options.onAction(adoptedAction); await drain(); expect(m.action).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250); await expect(delivery).resolves.toBe(result);
    expect(sdk.adoptDecision).toHaveBeenCalledExactlyOnceWith(view.value.decision.data.event, view.value.decision.data.adoption);
    expect(sdk.wakeOperation).not.toHaveBeenCalled(); expect(m.prepare).toHaveBeenCalledOnce();
    expect(m.grant.mock.invocationCallOrder[0]).toBeGreaterThan(m.adopt.mock.invocationCallOrder[0]);
    expect(m.ack.mock.invocationCallOrder[0]).toBeGreaterThan(m.grant.mock.invocationCallOrder[0]);
    expect(m.driver).toHaveBeenCalledExactlyOnceWith(session, sdk, adoptedAction, successorBinding);
    notice('outcome'); expect(fail).not.toHaveBeenCalled();
    const status = { phase: 'decision', message: 'Next decision', canContinue: true };
    m.boundary(status); expect(onDecision).toHaveBeenCalledExactlyOnceWith({ action: adoptedAction, binding: successorBinding }, status);
    await vi.advanceTimersByTimeAsync(30_000); expect(sdk.adoptDecision).toHaveBeenCalledOnce(); expect(m.cleanup).not.toHaveBeenCalled();
  });

  it.each(['same-epoch', 'intent', 'claim', 'selected', 'root'])('refuses %s before creating a channel or writing', async reason => {
    if (reason === 'same-epoch') view.head.epoch = 1;
    if (reason === 'intent') view.value.decision = { data: { adoption: {} } };
    if (reason === 'claim') view.value.claim = { data: {} };
    if (reason === 'selected') view.value.selected = null;
    if (reason === 'root') Object.assign(view.value.terminal.bound, { active: { id: 'foreign', sourceAttemptId: 'root-admission' } });
    run({ mode: 'adopt' }); await drain(); expect(fail).toHaveBeenCalledOnce(); expect(m.publication).not.toHaveBeenCalled();
    expect(m.prepare).not.toHaveBeenCalled(); expect(sdk.connect).not.toHaveBeenCalled(); expect(sdk.adoptDecision).not.toHaveBeenCalled();
  });

  it('does not replace an intention that appears while publication is pending', async () => {
    const barrier = hold(m.publication); run({ mode: 'adopt' }); await barrier.entered;
    const retained = { reference: { id: 'old-intent' }, data: { adoption: null } }; view.value.decision = retained;
    barrier.release(); await drain(); expect(fail).toHaveBeenCalledOnce(); expect(view.value.decision).toBe(retained);
    expect(m.prepare).not.toHaveBeenCalled(); expect(sdk.adoptDecision).not.toHaveBeenCalled();
  });

  it('permits an intermediate generic adoption, then commits the required current decision-specific guard after claim', async () => {
    view.head.epoch = 3; view.value.terminal.bound.launch.guard.owner = 'intermediate-owner'; view.value.terminal.bound.launch.guard.epoch = 2;
    sdk.adoptDecision.mockResolvedValueOnce(launchStartedFixture({ ...adoptionFixture().entry.request, sessionEpoch: '3' }, successorAction.runId));
    run({ mode: 'adopt' }); await vi.advanceTimersByTimeAsync(750);
    expect(m.adopt).toHaveBeenCalledOnce(); expect(m.adopt.mock.invocationCallOrder[0]).toBeGreaterThan(m.claim.mock.invocationCallOrder[0]);
    expect(m.grant).toHaveBeenCalledOnce(); expect(fail).not.toHaveBeenCalled();
  });

  it.each(['intermediate', 'returning'])('permits returning to the original owner ID at a newer epoch with %s root custody', async custody => {
    view.head.owner = 'owner'; view.head.epoch = 3; view.value.terminal.event.sessionEpoch = '2';
    view.value.terminal.bound.launch.guard.owner = custody === 'intermediate' ? 'intermediate-owner' : 'owner';
    view.value.terminal.bound.launch.guard.epoch = 2;
    sdk.adoptDecision.mockResolvedValueOnce(launchStartedFixture({ ...adoptionFixture().entry.request, sessionEpoch: '3' }, successorAction.runId));
    run({ mode: 'adopt' }); await vi.advanceTimersByTimeAsync(750);
    expect(sdk.adoptDecision).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessionEpoch: '2' }), expect.objectContaining({ nextSessionEpoch: '3' }));
    expect(m.adopt).toHaveBeenCalledOnce(); expect(m.adopt.mock.invocationCallOrder[0]).toBeGreaterThan(m.claim.mock.invocationCallOrder[0]);
    expect(m.grant).toHaveBeenCalledOnce(); expect(fail).not.toHaveBeenCalled();
  });

  it.each(['root', 'owner', 'acknowledged'])('refuses a %s change while remote evidence is pending, before cognitive work', async reason => {
    const barrier = hold(m.remote); run({ mode: 'adopt' }); await vi.advanceTimersByTimeAsync(250); await barrier.entered;
    if (reason === 'root') { const guard = view.value.terminal.bound.launch.guard; guard.owner = view.head.owner; guard.epoch = view.head.epoch; }
    if (reason === 'owner') view.head.owner = 'another';
    if (reason === 'acknowledged') Object.assign(view.value.terminal.bound, { operation: { state: 'acknowledged' } });
    barrier.release(); await drain(); expect(fail).toHaveBeenCalledOnce(); expect(sdk.adoptDecision).not.toHaveBeenCalled();
    expect(sdk.wakeOperation).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled();
  });

  it.each(['owner', 'epoch', 'selection'])('rechecks %s immediately before preparing', async reason => {
    const barrier = hold(m.publication); run({ mode: 'adopt' }); await barrier.entered;
    if (reason === 'owner') view.head.owner = 'another'; if (reason === 'epoch') view.head.epoch++;
    if (reason === 'selection') view.value.selected = null;
    barrier.release(); await drain(); expect(fail).toHaveBeenCalledOnce(); expect(m.prepare).not.toHaveBeenCalled(); expect(sdk.connect).not.toHaveBeenCalled();
  });

  it('never falls back to same-owner wake when the prepared intention lacks adoption', async () => {
    const prepare = m.prepare.getMockImplementation()!;
    m.prepare.mockImplementation(async () => { await prepare(); view.value.decision.data.adoption = null; });
    run({ mode: 'adopt' }); await drain(); expect(fail).toHaveBeenCalledOnce();
    expect(sdk.connect).not.toHaveBeenCalled(); expect(sdk.wakeOperation).not.toHaveBeenCalled(); expect(sdk.adoptDecision).not.toHaveBeenCalled();
  });

  it('does not let adoptionOnly pulse an independently retained intention without preparation', async () => {
    const controller = await createGameDecisionController(session, original.action, original.binding, { adoptionOnly: true,
      signal: scope.signal, factory: () => sdk });
    try { await m.prepare(); await expect(controller.pulse()).rejects.toThrow('explicit new-epoch intention'); }
    finally { controller.close(); }
    expect(sdk.connect).not.toHaveBeenCalled();
  });

  it('rejects contradictory controller modes before reading', async () => {
    await expect(createGameDecisionController(session, original.action, original.binding, { sameOwnerOnly: true, adoptionOnly: true })).rejects.toThrow('exclusive');
    expect(m.state).not.toHaveBeenCalled();
  });

  it.each(['state', 'prepare', 'connect', 'adopt', 'root-adopt', 'ack'])('Stop overtakes pending %s without replacing or settling anything', async stage => {
    const barrier = hold(({ state: m.state, prepare: m.prepare, connect: sdk.connect, adopt: sdk.adoptDecision, 'root-adopt': m.adopt, ack: m.ack })[stage]!);
    run({ mode: 'adopt' }); await vi.advanceTimersByTimeAsync(750); await barrier.entered;
    scope.abort(); const updates = update.mock.calls.length;
    if (stage !== 'state') expect(sdk.close).toHaveBeenCalledOnce();
    expect(host.signal.aborted).toBe(false); expect(m.cleanup).not.toHaveBeenCalled(); expect(sdk.stopDecision).not.toHaveBeenCalled();
    barrier.release(); await vi.advanceTimersByTimeAsync(30_000);
    expect(update).toHaveBeenCalledTimes(updates); expect(m.driver).not.toHaveBeenCalled(); expect(onDecision).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
    if (stage !== 'ack') expect(m.grant).not.toHaveBeenCalled();
  });

  it('closes a late navigation handle after the host lifetime ends', async () => {
    run({ mode: 'adopt' }); await vi.advanceTimersByTimeAsync(750);
    const barrier = hold(m.driver), delivery = options.onAction(adoptedAction); await barrier.entered;
    host.abort(); barrier.release(); await expect(delivery).resolves.toBe(result);
    expect(driverClose).toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
  });
});
