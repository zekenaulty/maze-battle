// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { readCanonical } from '../../../persistence/canonical/read';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import { navigationActionHooks, retainActionResult } from '../../../persistence/canonical/agentica/actions';
import { readPublication } from '../../../persistence/canonical/agentica/publication';
import { prepareAction } from '../../../persistence/canonical/agentica/validation';
import { protocolAction, protocolHead } from '../../../persistence/canonical/agentica/types.test-support';
import { isCurrentFrontier } from '../../../persistence/canonical/knowledge/frontiers';
import { createFrontierBinding, createExplorationBinding } from '../../../persistence/canonical/navigation/commands';
import { actionGrant } from './actionContract';
import { observeMaze } from './observation';
import { executeGameAction } from './actionExecution';

vi.mock('../../../persistence/canonical/read', async importOriginal => ({
  ...await importOriginal<typeof import('../../../persistence/canonical/read')>(), readCanonical: vi.fn(),
}));
vi.mock('../../../persistence/canonical/transaction', () => ({ executeCanonical: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/actions', () => ({ navigationActionHooks: vi.fn(), retainActionResult: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/publication', () => ({ readPublication: vi.fn() }));
vi.mock('../../../persistence/canonical/knowledge/frontiers', async importOriginal => ({
  ...await importOriginal<typeof import('../../../persistence/canonical/knowledge/frontiers')>(), isCurrentFrontier: vi.fn(),
}));
vi.mock('./actionContract', async importOriginal => ({ ...await importOriginal<typeof import('./actionContract')>(), actionGrant: vi.fn() }));
vi.mock('./observation', () => ({ observeMaze: vi.fn(), inspectMaze: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

function fixture() {
  const head = protocolHead(), pages = {}, tx = { head, pages }, binding = {
    grant: { key: 'agentica/grants/grant', id: 'grant' }, publication: { key: 'agentica/publications/pub', id: 'pub' } };
  const selection = { at: { level: 1, cell: { spaceId: 'entry', row: 0, column: 2 } }, direction: 'east' as const,
    source: { sequence: 1, id: 'sight', index: 2 } };
  const token = { schema: 1, publication: { ...binding.publication }, selection };
  const submitHostCommand = vi.fn(), port = { hostSignal: new AbortController().signal, submitHostCommand } as unknown as CanonicalHostPort;
  vi.mocked(readCanonical).mockImplementation(async work => ({ value: await work(pages as never, head as never) }) as never);
  vi.mocked(readPublication).mockResolvedValue({ snapshot: { checkpoint: head.checkpoint } } as Awaited<ReturnType<typeof readPublication>>);
  vi.mocked(isCurrentFrontier).mockResolvedValue(true);
  vi.mocked(executeCanonical).mockImplementation(async (_request, work) => await work(tx as never) as never);
  vi.mocked(observeMaze).mockResolvedValue({ observationId: 'publication', revision: head.revision,
    observedAt: '2026-10-18T00:00:00Z', data: { scope: 'actor' } });
  vi.mocked(retainActionResult).mockResolvedValue({ receipt: {}, reference: { key: 'agentica/result', id: 'result' } });
  vi.mocked(navigationActionHooks).mockImplementation((_identity, resultFor) => ({ prepare: vi.fn(),
    commit: vi.fn(async view => { await resultFor(view); return {}; }) }));
  async function run(args: Record<string, unknown> = { frontier: JSON.stringify(token) }) {
    const identity = await prepareAction({ ...protocolAction(), deadlineAt: '2099-01-01T00:00:00Z', capabilityId: 'maze.explore', arguments: args });
    await executeGameAction(port, binding, identity); return identity;
  }
  async function resolve() {
    const command = submitHostCommand.mock.calls[0][0];
    await command.execute({ operation: command.operation, input: command.input, attemptId: 'resolve', deadlineAt: null }, {});
    return vi.mocked(retainActionResult).mock.calls[0][3];
  }
  return { head, pages, binding, selection, token, port, submitHostCommand, run, resolve };
}

it('admits exactly the selected anchor/source/direction through the existing durable navigation operation', async () => {
  const f = fixture(), identity = await f.run(), command = f.submitHostCommand.mock.calls[0][0];
  expect(command).toMatchObject({ kind: 'fresh', operation: 'operation.admit', input: {
    operationId: `travel-${identity.storageKey.slice(-64)}`, binding: createFrontierBinding(f.selection), ackPolicy: 'verified-host' } });
  expect(f.submitHostCommand).toHaveBeenCalledOnce();
  expect(isCurrentFrontier).toHaveBeenCalledWith(f.pages, f.head.checkpoint, f.selection);
  expect(retainActionResult).not.toHaveBeenCalled();
});

it('owns the parsed selection before asynchronous preflight reads', async () => {
  const f = fixture(), args = { frontier: JSON.stringify(f.token) };
  vi.mocked(isCurrentFrontier).mockImplementation(async () => { args.frontier = JSON.stringify({ ...f.token, selection: { ...f.selection, direction: 'west' } }); return true; });
  await f.run(args);
  expect(f.submitHostCommand.mock.calls[0][0].input.binding).toEqual(createFrontierBinding(f.selection));
});

it('admits room coverage only when explicitly selected, keeping the original frontier frozen', async () => {
  const f = fixture(); f.selection.at.cell.spaceId = 'room'; await f.run({ frontier: JSON.stringify(f.token), mode: 'room' });
  expect(f.submitHostCommand.mock.calls[0][0].input.binding).toEqual(createExplorationBinding(f.selection));
});
it('refuses room coverage of another space without admitting movement', async () => {
  const f = fixture(); f.selection.at.cell.spaceId = 'other';
  await f.run({ frontier: JSON.stringify(f.token), mode: 'room' });
  expect((await f.resolve()).disposition).toBe('refused'); expect(isCurrentFrontier).not.toHaveBeenCalled();
});
it.each(['auto', 'floor', null, false])('refuses unsupported exploration mode %j', async mode => {
  const f = fixture(); await f.run({ frontier: JSON.stringify(f.token), mode });
  expect((await f.resolve()).disposition).toBe('refused'); expect(navigationActionHooks).not.toHaveBeenCalled();
});

it.each(['publication id', 'publication key'])('refuses foreign %s before reading frontier evidence', async damage => {
  const f = fixture();
  if (damage === 'publication id') f.token.publication.id = 'other'; else f.token.publication.key = 'agentica/publications/other';
  await f.run(); const result = await f.resolve();
  expect(result).toMatchObject({ disposition: 'refused', summary: 'Invalid arguments for this capability.' });
  expect(result.operation).toBeUndefined(); expect(isCurrentFrontier).not.toHaveBeenCalled();
  expect(actionGrant).toHaveBeenCalledOnce();
});

it.each(['direction', 'source id', 'source index', 'anchor'])('refuses a nonmember %s without admitting an operation', async damage => {
  const f = fixture();
  if (damage === 'direction') Object.assign(f.selection, { direction: 'north' });
  if (damage === 'source id') f.selection.source.id = 'other';
  if (damage === 'source index') f.selection.source.index++;
  if (damage === 'anchor') f.selection.at.cell.column++;
  vi.mocked(isCurrentFrontier).mockResolvedValue(false);
  await f.run(); const result = await f.resolve();
  expect(result.disposition).toBe('refused'); expect(result.operation).toBeUndefined();
  expect(f.submitHostCommand.mock.calls[0][0].operation).toBe('agentica.action.resolve');
  expect(navigationActionHooks).not.toHaveBeenCalled();
});

it.each(['bad JSON', 'extra argument', 'wrong schema', 'missing source', 'bad direction', 'non-string'])('refuses malformed selection: %s', async damage => {
  const f = fixture(), token = structuredClone(f.token), args: Record<string, unknown> = {};
  if (damage === 'wrong schema') token.schema = 2;
  if (damage === 'missing source') Reflect.deleteProperty(token.selection, 'source');
  if (damage === 'bad direction') Object.assign(token.selection, { direction: 'down' });
  args.frontier = damage === 'bad JSON' ? '{' : damage === 'non-string' ? token : JSON.stringify(token);
  if (damage === 'extra argument') args.target = f.selection.at;
  await f.run(args); const result = await f.resolve();
  expect(result.disposition).toBe('refused'); expect(result.operation).toBeUndefined();
  expect(isCurrentFrontier).not.toHaveBeenCalled(); expect(navigationActionHooks).not.toHaveBeenCalled();
});

it('does not convert corrupt frontier evidence into a refusal or absence', async () => {
  const f = fixture(); vi.mocked(isCurrentFrontier).mockRejectedValue(new Error('corrupt earned source'));
  await expect(f.run()).rejects.toThrow('corrupt earned source');
  expect(f.submitHostCommand).not.toHaveBeenCalled(); expect(retainActionResult).not.toHaveBeenCalled();
});
