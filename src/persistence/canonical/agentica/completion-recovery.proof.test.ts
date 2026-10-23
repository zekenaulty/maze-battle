import { beforeEach, expect, it, vi } from 'vitest';
import { prepareAction } from './validation';
import { proveStoppedCompletion } from './completion-recovery.proof';
import { binding, parentAction, pendingAction } from '../../../services/agentica/game/pendingRecovery.test-support';

const m = vi.hoisted(() => ({ read: vi.fn(), claim: vi.fn(), stop: vi.fn(), grant: vi.fn(), original: vi.fn(), result: vi.fn(), bound: vi.fn() }));
vi.mock('../read', () => ({ readCanonical: m.read }));
vi.mock('./recovery.database', () => ({ inRecoveryDatabase: async (_: unknown, work: (signal: AbortSignal) => unknown) => work(new AbortController().signal) }));
vi.mock('./decision.claim', () => ({ loadDecisionClaim: m.claim }));
vi.mock('./launch.terminal', () => ({ loadLaunchTerminal: m.stop }));
vi.mock('./run-grant.read', () => ({ loadRunGrant: m.grant }));
vi.mock('./actions.original', () => ({ loadOriginalAction: m.original }));
vi.mock('./actions.result', () => ({ readActionResultSource: m.result }));
vi.mock('./operation.binding', async original => ({ ...await original<object>(), assertBoundAction: m.bound }));

const fence = { generation: 'generation', gameId: 'game', owner: 'owner', epoch: 3, revision: 25 };
const grantRef = { key: 'agentica/successor/grant', id: 'successor-grant' };
const publication = { key: 'agentica/successor/publication', id: 'successor-publication' };
const action = () => ({ ...structuredClone(pendingAction), arguments: { scope: 'objective' } });
const started = () => ({ runId: 'successor', sessionId: 'session', sessionEpoch: '2', manifestHash: pendingAction.manifestHash });
const launch = { binding: { launchId: 'launch' }, guard: { id: 'guard', admissionAttemptId: 'admission' } };
const result = () => ({ actionId: 'pending', sessionId: 'session', sessionEpoch: '2', disposition: 'applied',
  beforeRevision: 22, afterRevision: 22, evidenceId: 'evidence', completion: { evidenceId: 'evidence' }, summary: 'Original.' });
let get: ReturnType<typeof vi.fn>;
let actionKey: string;
beforeEach(async () => {
  vi.resetAllMocks();
  actionKey = (await prepareAction(action())).storageKey;
  get = vi.fn(async (_area: string, _key: string) => ({ id: 'row' }));
  m.read.mockImplementation(async work => ({ head: structuredClone(fence), value: await work({ get }) }));
  m.claim.mockResolvedValue({ data: { started: started() }, decision: { data: { binding }, terminal: { bound: { launch } } } });
  m.stop.mockResolvedValue({ guardId: 'guard', admissionAttemptId: 'admission', terminal: { receipt: { beforeRevision: 24 } } });
  m.grant.mockResolvedValue({ started: started(), launch, record: { ref: grantRef, value: { data: { publication } } } });
  m.original.mockResolvedValue({ original: { publication, effect: 'readOnly', sourceRequest: { input: { action: actionKey, grant: grantRef, publication } } } });
  m.result.mockResolvedValue({ result: result(), sourceRequest: { expected: { revision: 21 } } });
});
const prove = async (input = action()) => proveStoppedCompletion(fence, await prepareAction(parentAction), binding, input);

it('returns the exact validated historical completion under a new owner epoch, never stages writes', async () => {
  expect(await prove()).toEqual(result());
  expect(m.bound).toHaveBeenCalledOnce(); expect(m.result).toHaveBeenCalledOnce();
  expect(get.mock.calls.every(call => call[0] === 'execution')).toBe(true);
});

it.each(['stop', 'grant', 'run', 'action-key', 'original-grant', 'publication', 'missing-result', 'incomplete', 'after-stop', 'fence'] as const)
('refuses %s evidence rather than inventing no-effect or completion', async defect => {
  if (defect === 'stop') m.stop.mockRejectedValue(Error('launch has no cancellation receipt'));
  if (defect === 'grant') get.mockResolvedValueOnce(undefined);
  if (defect === 'run') m.grant.mockResolvedValue({ started: { ...started(), runId: 'foreign' }, launch });
  if (defect === 'action-key') m.original.mockResolvedValue({ original: { effect: 'readOnly', publication,
    sourceRequest: { input: { action: `${actionKey}-other`, grant: grantRef, publication } } } });
  if (defect === 'original-grant') m.original.mockResolvedValue({ original: { effect: 'readOnly', publication,
    sourceRequest: { input: { action: actionKey, grant: binding.grant, publication } } } });
  if (defect === 'publication') m.original.mockResolvedValue({ original: { effect: 'readOnly', publication: binding.publication,
    sourceRequest: { input: { action: actionKey, grant: grantRef, publication: binding.publication } } } });
  if (defect === 'missing-result') get.mockResolvedValueOnce({ id: 'grant' }).mockResolvedValueOnce(undefined);
  if (defect === 'incomplete') m.result.mockResolvedValue({ result: { ...result(), completion: undefined }, sourceRequest: { expected: { revision: 21 } } });
  if (defect === 'after-stop') m.result.mockResolvedValue({ result: result(), sourceRequest: { expected: { revision: 24 } } });
  if (defect === 'fence') m.read.mockImplementation(async work => ({ head: { ...fence, epoch: 4 }, value: await work({ get }) }));
  await expect(prove()).rejects.toThrow();
});

it('snapshots caller inputs before the first await and rejects non-objective actions', async () => {
  const input = action(), capturedFence = { ...fence }, capturedBinding = structuredClone(binding), parent = await prepareAction(parentAction);
  const pending = proveStoppedCompletion(capturedFence, parent, capturedBinding, input);
  input.runId = 'changed'; input.arguments.scope = 'room'; capturedFence.epoch = 9; capturedBinding.grant.id = 'changed';
  expect(await pending).toEqual(result());
  expect(m.result.mock.calls[0][1].action).toEqual(action());
  await expect(prove({ ...action(), arguments: { scope: 'room' } })).rejects.toThrow('original objective check');
});
