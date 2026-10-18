// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { candidate, clearance, descriptor, fence, inspectGamePendingAction, listGamePendingActions, noEffect,
  page, pendingAction, reconcileGamePendingAction, remoteEntry, reply, response, setup } from './pendingActionRecovery.test-support';

const m = vi.hoisted(() => ({ database: vi.fn(), inspect: vi.fn(), decision: vi.fn(), stop: vi.fn(), proof: vi.fn(), sdk: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: m.database }));
vi.mock('../../../persistence/canonical/agentica/recovery', () => ({ inspectAgenticaRecovery: m.inspect }));
vi.mock('../../../persistence/canonical/agentica/launch.terminal', () => ({ readLaunchTerminal: m.stop }));
vi.mock('./decisionState', () => ({ decisionState: m.decision }));
vi.mock('../../../persistence/canonical/agentica/pregrant-proof', () => ({ provePregrantNoEffect: m.proof }));
vi.mock('../sdk/agentica-host.mjs', async original => ({ ...await original<object>(),
  AgenticaHost: class { constructor() { m.sdk(); throw new Error('SDK lifecycle forbidden'); } } }));

let s: ReturnType<typeof setup>;
beforeEach(() => { s = setup(m); });
const list = (afterActionId?: string) => listGamePendingActions(s.port, fence, candidate, { ...s.options, afterActionId });
const inspect = () => inspectGamePendingAction(s.port, fence, candidate, descriptor(), s.options);

describe('explicit pending action recovery', () => {
  it('reads one descriptor-only page, never full requests, proof, SDK or game effects', async () => {
    expect(await list()).toEqual({ ...page(), ...clearance }); expect(s.http).toHaveBeenCalledTimes(1);
    const [url, init] = s.http.mock.calls[0], parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/api/recovery/run'); expect(Object.fromEntries(parsed.searchParams)).toEqual({
      hostId: 'maze-battle', sessionId: 'session', sessionEpoch: '2', runId: 'successor' });
    expect(parsed.hash).toBe(''); expect(init).toMatchObject({ method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit' });
    expect(m.proof).not.toHaveBeenCalled(); expect(m.sdk).not.toHaveBeenCalled();
    expect(s.port.submitHostCommand).not.toHaveBeenCalled(); expect(s.port.cleanupHostOperation).not.toHaveBeenCalled();
  });
  it('keeps empty discovery unknown and does not auto-select or request another page', async () => {
    s.http.mockResolvedValue(response(page([])));
    expect(await list()).toEqual({ ...page([]), ...clearance }); expect(s.http).toHaveBeenCalledTimes(1);
  });
  it('passes an explicit keyset cursor without a caller-selected limit or automatic paging', async () => {
    const items = Array.from({ length: 16 }, (_, n) => ({ ...descriptor(`a${String(n).padStart(2, '0')}`),
      disposition: n ? null : 'unavailable', recoveryRetention: n ? 'reserved' : 'http' }));
    s.http.mockResolvedValue(response(page(items, 'a15')));
    expect((await list('a')).items).toEqual(items); expect(s.http).toHaveBeenCalledTimes(1);
    const query = new URL(String(s.http.mock.calls[0][0])).searchParams;
    expect(query.get('afterActionId')).toBe('a'); expect(query.has('limit')).toBe(false);
  });
  it('inspects only the selected exact original and returns a pure local proof without POST', async () => {
    s.http.mockResolvedValue(response(remoteEntry()));
    const selection = await inspect();
    expect(selection).toEqual({ status: 'action-inspected', descriptor: descriptor(), action: pendingAction, result: noEffect, ...clearance });
    expect(new URL(String(s.http.mock.calls[0][0])).searchParams.get('actionId')).toBe('pending');
    expect(s.http).toHaveBeenCalledTimes(1); expect(m.proof).toHaveBeenCalledTimes(1);
    expect(m.proof.mock.calls[0][0]).toEqual(fence); expect(m.proof.mock.calls[0][1].action.actionId).toBe('parent');
    expect(m.proof.mock.calls[0][2]).toEqual(candidate.binding); expect(m.proof.mock.calls[0][3]).toEqual(pendingAction);
  });
  it('reconciles via the actual composition and passes the exact controller without game effects', async () => {
    s.http.mockResolvedValueOnce(response(remoteEntry())); const selection = await inspect();
    s.http.mockResolvedValueOnce(response(remoteEntry())).mockResolvedValueOnce(response(reply())).mockResolvedValueOnce(response(remoteEntry(true)));
    expect(await reconcileGamePendingAction(s.port, fence, candidate, selection, s.options))
      .toEqual({ status: 'action-reconciled', result: noEffect, duplicate: false, ...clearance });
    expect(s.http).toHaveBeenCalledTimes(4); expect(m.proof).toHaveBeenCalledTimes(4);
    expect(JSON.parse(s.http.mock.calls[2][1]!.body as string)).toEqual({ hostId: 'maze-battle', sessionId: 'session', result: noEffect });
    expect(s.port.submitHostCommand).not.toHaveBeenCalled(); expect(s.port.cleanupHostOperation).not.toHaveBeenCalled(); expect(m.sdk).not.toHaveBeenCalled();
  });
  it('retains the selection after a lost reply for explicit exact duplicate retry', async () => {
    s.http.mockResolvedValueOnce(response(remoteEntry())); const selection = await inspect();
    s.http.mockResolvedValueOnce(response(remoteEntry())).mockRejectedValueOnce(new Error('reply lost'));
    await expect(reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).rejects.toThrow('reply lost');
    expect(s.http).toHaveBeenCalledTimes(3);
    s.http.mockResolvedValueOnce(response(remoteEntry(true))).mockResolvedValueOnce(response(reply(true))).mockResolvedValueOnce(response(remoteEntry(true)));
    expect((await reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).duplicate).toBe(true);
    expect(s.http.mock.calls[4][1]!.body).toBe(s.http.mock.calls[2][1]!.body);
  });
  it('rediscovers retained HTTP completion using a new controller and a fresh explicit inspection', async () => {
    const retained = { ...descriptor(), disposition: 'unavailable', recoveryRetention: 'http' };
    s = setup(m); s.http.mockResolvedValueOnce(response(page([retained])));
    const found = await list(); s.http.mockResolvedValueOnce(response(remoteEntry(true)));
    const selected = await inspectGamePendingAction(s.port, fence, candidate, found.items[0], s.options);
    s.http.mockResolvedValueOnce(response(remoteEntry(true))).mockResolvedValueOnce(response(reply(true))).mockResolvedValueOnce(response(remoteEntry(true)));
    expect((await reconcileGamePendingAction(s.port, fence, candidate, selected, s.options)).duplicate).toBe(true);
  });
  it('accepts a legitimate interim unresolved result without importing remote observations', async () => {
    const entry = { ...remoteEntry(), result: { ...noEffect, disposition: 'unresolved', observation: {
      observationId: 'remote', revision: noEffect.afterRevision, observedAt: '2026-10-17T10:00:00Z', data: { secret: 'not imported' } } },
      resultHash: `sha256:${'e'.repeat(64)}` };
    s.http.mockResolvedValue(response(entry)); const selection = await inspect();
    expect(selection.result).toEqual(noEffect); expect(JSON.stringify(selection)).not.toContain('not imported');
  });
  it.each(['hash', 'action', 'session', 'epoch', 'run', 'objective', 'capability', 'result'])('refuses a changed exact %s without POST', async kind => {
    const entry = remoteEntry(true);
    if (kind === 'hash') entry.requestHash = `sha256:${'f'.repeat(64)}`;
    if (kind === 'action') entry.request.actionId = 'other';
    if (kind === 'session') entry.sessionId = 'other';
    if (kind === 'epoch') entry.sessionEpoch = 'other';
    if (kind === 'run') entry.runId = 'other';
    if (kind === 'objective') entry.objectiveId = 'other';
    if (kind === 'capability') entry.capability.name += 'changed';
    if (kind === 'result') entry.result!.evidenceId += 'changed';
    s.http.mockResolvedValue(response(entry)); await expect(inspect()).rejects.toThrow(); expect(s.http).toHaveBeenCalledTimes(1);
  });
  it.each(['copy', 'mutation', 'controller'])('refuses a %s of a selected original before POST', async kind => {
    s.http.mockResolvedValue(response(remoteEntry())); let selection = await inspect();
    if (kind === 'copy') selection = structuredClone(selection);
    if (kind === 'mutation') selection.action.arguments.scope = 'map';
    const port = kind === 'controller' ? Object.create(s.port) as typeof s.port : s.port;
    await expect(reconcileGamePendingAction(port, fence, candidate, selection, s.options)).rejects.toThrow('inspect the exact');
    expect(s.http).toHaveBeenCalledTimes(1);
  });
  it.each(['initial', 'final'])('requires the selected hashes at the %s exact lookup', async stage => {
    s.http.mockResolvedValueOnce(response(remoteEntry())); const selection = await inspect();
    const changed = { ...remoteEntry(true), capabilityHash: `sha256:${'f'.repeat(64)}` };
    if (stage === 'final') s.http.mockResolvedValueOnce(response(remoteEntry())).mockResolvedValueOnce(response(reply()));
    s.http.mockResolvedValueOnce(response(changed));
    await expect(reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).rejects.toThrow('hashes changed');
    expect(s.http).toHaveBeenCalledTimes(stage === 'initial' ? 2 : 4);
  });
  it('rejects a changed original body after inspection even when the descriptor hashes are repeated', async () => {
    s.http.mockResolvedValueOnce(response(remoteEntry())); const selection = await inspect();
    const changed = remoteEntry(); changed.request.arguments.scope = 'map'; s.http.mockResolvedValueOnce(response(changed));
    await expect(reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).rejects.toThrow('request or binding changed');
    expect(s.http).toHaveBeenCalledTimes(2);
  });
  it.each(['custody.not_found', 'recovery.live_run'])('preserves %s as a refusal, never clearance or an automatic retry', async code => {
    s.http.mockResolvedValueOnce(response(remoteEntry())); const selection = await inspect();
    if (code === 'recovery.live_run') s.http.mockResolvedValueOnce(response(remoteEntry()));
    s.http.mockResolvedValueOnce(response({ code, message: 'Unresolved' }, 409));
    await expect(reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).rejects.toMatchObject({ code });
    expect(s.http).toHaveBeenCalledTimes(code === 'recovery.live_run' ? 3 : 2);
  });
});
