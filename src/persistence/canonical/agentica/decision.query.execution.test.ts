// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { CanonicalHostPort } from '../../../services/game/CanonicalHostCommand';
import { actionGrant } from '../../../services/agentica/game/actionContract';
import { executeGameAction } from '../../../services/agentica/game/actionExecution';
import { inspectMaze, observeMaze } from '../../../services/agentica/game/observation';
import { executeCanonical, type CanonicalWork } from '../transaction';
import { retainActionResult } from './actions';
import { queryDecision } from './decision.query.prepare';
import { DecisionQueryRefusal } from './decision.query.read';
import { protocolAction, protocolHead, protocolResult } from './types.test-support';
import { prepareAction } from './validation';

vi.mock('../transaction', async original => ({ ...await original<typeof import('../transaction')>(), executeCanonical: vi.fn() }));
vi.mock('./actions', () => ({ retainActionResult: vi.fn(), navigationActionHooks: vi.fn() }));
vi.mock('./decision.query.prepare', () => ({ queryDecision: vi.fn() }));
vi.mock('../../../services/agentica/game/actionContract', async original => ({
  ...await original<typeof import('../../../services/agentica/game/actionContract')>(), actionGrant: vi.fn(),
}));
vi.mock('../../../services/agentica/game/observation', () => ({ observeMaze: vi.fn(), inspectMaze: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture(args: Record<string, unknown> = { scope: 'decision' }) {
  const head = protocolHead(), get = vi.fn(async () => undefined), tx = { head,
    pages: { get, sourceReceipt: vi.fn(), savedSnapshot: vi.fn() }, liveOperation: vi.fn() } as unknown as CanonicalWork;
  const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/publications/current', id: 'pub' } };
  const identity = await prepareAction({ ...protocolAction(), arguments: args, deadlineAt: '2099-01-01T00:00:00Z' });
  const result = { ...protocolResult(identity.action), observation: { ...protocolResult(identity.action).observation!,
    data: { scope: 'decision', state: 'unavailable', reason: 'initial-window' } } };
  const proof = { schema: 1 as const, grant: binding.grant, previous: null };
  vi.mocked(queryDecision).mockResolvedValue({ result, proof });
  vi.mocked(actionGrant).mockResolvedValue({ publication: { wireRevision: head.revision, snapshot: { checkpoint: head.checkpoint } } } as Awaited<ReturnType<typeof actionGrant>>);
  vi.mocked(executeCanonical).mockImplementation(async (_request, work) => await work(tx) as never);
  vi.mocked(retainActionResult).mockResolvedValue({ reference: { key: 'agentica/result', id: 'result' }, receipt: {} });
  const submitHostCommand = vi.fn(), port = { submitHostCommand } as unknown as CanonicalHostPort;
  await executeGameAction(port, binding, identity);
  const command = submitHostCommand.mock.calls[0][0];
  const resolve = () => command.execute({ attemptId: 'resolve', operation: command.operation, input: command.input, deadlineAt: null }, {});
  return { head, tx, binding, identity, result, proof, submitHostCommand, resolve, get };
}

it('dispatches an explicit decision as one query result, with its private proof and no perception/effect path', async () => {
  const f = await fixture(); await f.resolve();
  expect(f.submitHostCommand).toHaveBeenCalledOnce();
  expect(f.submitHostCommand.mock.calls[0][0].operation).toBe('agentica.action.resolve');
  expect(retainActionResult).toHaveBeenCalledWith(f.tx, expect.anything(), f.identity, f.result, undefined, undefined, f.proof);
  expect(observeMaze).not.toHaveBeenCalled(); expect(inspectMaze).not.toHaveBeenCalled(); expect(f.get).not.toHaveBeenCalled();
});

it.each(['Historical decision exceeds the query envelope.', 'Historical decision read budget exhausted.'])(
  'retains explicit refusal without perception fallback: %s', async message => {
    const f = await fixture(); vi.mocked(queryDecision).mockRejectedValue(new DecisionQueryRefusal(message));
    await f.resolve();
    const result = vi.mocked(retainActionResult).mock.calls[0][3];
    expect(result).toMatchObject({ disposition: 'refused', summary: message, observation: { data: { scope: 'decision', state: 'refused' } } });
    expect(result.operation).toBeUndefined(); expect(result.completion).toBeUndefined();
    expect(observeMaze).not.toHaveBeenCalled(); expect(inspectMaze).not.toHaveBeenCalled(); expect(f.get).not.toHaveBeenCalled();
  });

it('does not retain fabricated unavailability for corrupt historical evidence', async () => {
  const f = await fixture(); vi.mocked(queryDecision).mockRejectedValue(Error('Corrupt source witness'));
  await expect(f.resolve()).rejects.toThrow('Corrupt source witness');
  expect(retainActionResult).not.toHaveBeenCalled(); expect(observeMaze).not.toHaveBeenCalled();
});

it('refuses caller-selected history without falling through to perception', async () => {
  const f = await fixture({ scope: 'decision', target: 'foreign-intent' }); await f.resolve();
  expect(vi.mocked(retainActionResult).mock.calls[0][3]).toMatchObject({ disposition: 'refused',
    observation: { data: { scope: 'decision', state: 'refused' } } });
  expect(queryDecision).not.toHaveBeenCalled(); expect(observeMaze).not.toHaveBeenCalled(); expect(inspectMaze).not.toHaveBeenCalled();
});

it('owns the reserved inputs across host scheduling', async () => {
  const f = await fixture(), original = structuredClone({ action: f.identity.action, binding: f.binding });
  f.binding.publication.id = 'mutated'; Object.assign(f.identity.action, { actionId: 'mutated', arguments: { scope: 'objects' } });
  await f.resolve();
  expect(queryDecision).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: original.action }), original.binding);
});

it('meters both live authorization and query reads within the shared fresh budget', async () => {
  const f = await fixture();
  vi.mocked(actionGrant).mockImplementation(async context => {
    for (let i = 0; i < 126; i++) await context.pages.get('execution', `authority-${i}`);
    return { publication: { wireRevision: f.head.revision, snapshot: { checkpoint: f.head.checkpoint } } } as Awaited<ReturnType<typeof actionGrant>>;
  });
  vi.mocked(queryDecision).mockImplementation(async context => {
    for (let i = 0; i < 7; i++) await context.pages.get('execution', `history-${i}`);
    return { result: f.result, proof: f.proof };
  });
  await f.resolve();
  expect(f.get).toHaveBeenCalledTimes(128);
  expect(vi.mocked(retainActionResult).mock.calls[0][3]).toMatchObject({ disposition: 'refused', summary: 'Historical decision read budget exhausted.' });
});
