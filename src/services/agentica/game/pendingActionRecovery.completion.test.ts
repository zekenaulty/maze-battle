// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { candidate, clearance, descriptor, fence, inspectGamePendingAction, listGamePendingActions,
  page, pendingAction, reconcileGamePendingAction, remoteEntry, reply, response, setup, view } from './pendingActionRecovery.test-support';

const m = vi.hoisted(() => ({ database: vi.fn(), inspect: vi.fn(), decision: vi.fn(), stop: vi.fn(), proof: vi.fn(), completion: vi.fn(), sdk: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: m.database }));
vi.mock('../../../persistence/canonical/agentica/recovery', () => ({ inspectAgenticaRecovery: m.inspect }));
vi.mock('../../../persistence/canonical/agentica/launch.terminal', () => ({ readLaunchTerminal: m.stop }));
vi.mock('./decisionState', () => ({ decisionState: m.decision }));
vi.mock('../../../persistence/canonical/agentica/pregrant-proof', () => ({ provePregrantNoEffect: m.proof }));
vi.mock('../../../persistence/canonical/agentica/completion-recovery.proof', () => ({ proveStoppedCompletion: m.completion }));
vi.mock('../sdk/agentica-host.mjs', async original => ({ ...await original<object>(),
  AgenticaHost: class { constructor() { m.sdk(); throw Error('SDK lifecycle forbidden'); } } }));

const action = { ...pendingAction, arguments: { scope: 'objective' } };
const result = { actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
  disposition: 'applied', beforeRevision: 22, afterRevision: 22, summary: 'Original.', evidenceId: 'proof', completion: { evidenceId: 'proof' } };
const entry = (pinned = false) => ({ ...remoteEntry(pinned), request: structuredClone(action),
  result: pinned ? { ...result, observation: null, operation: null } : null });
let s: ReturnType<typeof setup>;
beforeEach(() => {
  s = setup(m);
  m.decision.mockImplementation(async () => {
    const current = view(); current.value.grant = { started: current.value.claim.data.started,
      record: { ref: { key: 'agentica/successor', id: 'grant' } } }; return current;
  });
  m.completion.mockImplementation(async () => structuredClone(result));
});
const inspect = () => inspectGamePendingAction(s.port, fence, candidate, descriptor(), s.options);

it('lists granted custody without proof, then explicitly sends only the exact retained completion', async () => {
  s.http.mockResolvedValueOnce(response(page()));
  await listGamePendingActions(s.port, fence, candidate, s.options);
  expect(m.completion).not.toHaveBeenCalled(); expect(m.proof).not.toHaveBeenCalled();
  s.http.mockResolvedValueOnce(response(entry())); const selected = await inspect();
  expect(selected.result).toEqual(result); expect(s.http).toHaveBeenCalledTimes(2);
  s.http.mockResolvedValueOnce(response(entry())).mockResolvedValueOnce(response(reply())).mockResolvedValueOnce(response(entry(true)));
  expect(await reconcileGamePendingAction(s.port, fence, candidate, selected, s.options))
    .toEqual({ status: 'action-reconciled', result, duplicate: false, ...clearance });
  expect(JSON.parse(s.http.mock.calls[3][1]!.body as string)).toEqual({ hostId: 'maze-battle', sessionId: action.sessionId, result });
  expect(m.completion).toHaveBeenCalledTimes(4); expect(m.proof).not.toHaveBeenCalled(); expect(m.sdk).not.toHaveBeenCalled();
  expect(s.port.submitHostCommand).not.toHaveBeenCalled(); expect(s.port.cleanupHostOperation).not.toHaveBeenCalled();
});

it('never falls back to a no-effect result when a granted action lacks committed completion', async () => {
  s.http.mockResolvedValueOnce(response(entry())); m.completion.mockRejectedValue(Error('requires committed result'));
  await expect(inspect()).rejects.toThrow('requires committed result');
  expect(m.proof).not.toHaveBeenCalled(); expect(s.http).toHaveBeenCalledTimes(1);
});

it('requires the same selected grant across inspection and reconciliation before any POST', async () => {
  s.http.mockResolvedValueOnce(response(entry())); const selected = await inspect();
  m.decision.mockImplementation(async () => {
    const current = view(); current.value.grant = { started: current.value.claim.data.started,
      record: { ref: { key: 'agentica/successor', id: 'changed' } } }; return current;
  });
  await expect(reconcileGamePendingAction(s.port, fence, candidate, selected, s.options)).rejects.toThrow('inspect the exact');
  expect(s.http).toHaveBeenCalledTimes(1); expect(m.proof).not.toHaveBeenCalled();
});
