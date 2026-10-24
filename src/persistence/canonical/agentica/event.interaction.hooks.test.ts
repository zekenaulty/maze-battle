// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { gameCheckpoint } from '../game/checkpoint';
import type { InteractionProgress } from '../interaction/types';
import { createInteractionBinding } from '../interaction/validation';
import { loadObservation, validateKnowledge } from '../knowledge/evidence';
import type { OperationCommit } from '../operationHost';
import { interactionProgressHooks } from './event.hooks';
import { loadOperationConfirmation } from './operation.confirmation';
import { loadOperationCustodyAck } from './operation.custody';
import { readPublication } from './publication';
import { readPublicationSelection } from './publication-selection.records';
import { loadTransfer } from './transfer.records';
import { prepareAction } from './validation';
import { protocolAction, protocolHead } from './types.test-support';
import { chestArgs, resolveChestSelection } from '../../../services/agentica/game/chestSelection';

vi.mock('./operation.confirmation', () => ({ loadOperationConfirmation: vi.fn() }));
vi.mock('./operation.custody', () => ({ loadOperationCustodyAck: vi.fn() }));
vi.mock('./transfer.records', () => ({ loadTransfer: vi.fn() }));
vi.mock('./publication-selection.records', () => ({ readPublicationSelection: vi.fn() }));
vi.mock('./publication', async original => ({ ...await original<typeof import('./publication')>(), readPublication: vi.fn() }));
vi.mock('../knowledge/evidence', () => ({ validateKnowledge: vi.fn(), loadObservation: vi.fn() }));
vi.mock('../../../services/agentica/game/chestSelection', () => ({ chestArgs: vi.fn(), resolveChestSelection: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture() {
  const identity = await prepareAction({ ...protocolAction(), capabilityId: 'maze.interact', arguments: { target: 'public-token' } });
  const head = protocolHead(), cp = gameCheckpoint(head.checkpoint);
  const pending: InteractionProgress = { schema: 1, operationId: 'interact', sourceAttemptId: 'admit', owner: head.owner,
    epoch: head.epoch, sequence: 0, status: 'pending', reason: null, result: null,
    binding: createInteractionBinding({ kind: 'open-chest', chestId: 'private-chest' }, cp.position) };
  const confirmation = { key: 'agentica/confirmation', id: 'confirmed' }, custody = { key: 'agentica/custody', id: 'acknowledged' };
  const binding = { grant: { key: 'grant', id: 'grant' }, publication: { key: 'publication', id: 'publication' } };
  const operation = { generation: head.generation, gameId: head.gameId, id: 'interact', state: 'admitted', owner: head.owner, epoch: head.epoch };
  const bound = { kind: 'interaction', progress: pending, binding, operation, start: { hostId: 'host' },
    launch: { binding: { launchId: 'launch' }, guard: { state: 'admitted', owner: head.owner, epoch: head.epoch, revision: 4, admissionAttemptId: 'root-admit' } },
    active: { id: 'launch', sourceAttemptId: 'root-admit' }, grant: { value: { data: { owner: head.owner, epoch: head.epoch, guardRevision: 4 } } } };
  const confirmed = { reference: confirmation, source: { expected: { owner: head.owner, epoch: head.epoch } }, bound };
  const publication = { owner: head.owner, epoch: head.epoch, snapshot: { generation: head.generation, gameId: head.gameId,
    revision: head.revision, roots: { world: head.roots.world, knowledge: head.roots.knowledge }, checkpoint: head.checkpoint } };
  vi.mocked(loadOperationConfirmation).mockResolvedValue(confirmed as unknown as NonNullable<Awaited<ReturnType<typeof loadOperationConfirmation>>>);
  vi.mocked(loadOperationCustodyAck).mockResolvedValue({ reference: custody } as unknown as NonNullable<Awaited<ReturnType<typeof loadOperationCustodyAck>>>);
  vi.mocked(readPublicationSelection).mockResolvedValue({ value: { data: binding } } as unknown as NonNullable<Awaited<ReturnType<typeof readPublicationSelection>>>);
  vi.mocked(readPublication).mockResolvedValue(publication as unknown as Awaited<ReturnType<typeof readPublication>>);
  vi.mocked(loadTransfer).mockResolvedValue(null);
  vi.mocked(chestArgs).mockReturnValue({ publication: binding.publication, source: { sequence: 1, id: 'sight', index: 0 }, chestIndex: 0 });
  vi.mocked(resolveChestSelection).mockResolvedValue({ command: { kind: 'open-chest', chestId: 'private-chest' }, position: structuredClone(cp.position) });
  vi.mocked(validateKnowledge).mockResolvedValue(null);
  vi.mocked(loadObservation).mockResolvedValue({ header: { revision: 8, observedAt: '2026-10-18T00:00:00.000Z' } } as Awaited<ReturnType<typeof loadObservation>>);
  const appendExecution = vi.fn(async () => ({ key: 'event', recordId: 'event', revision: 8, sourceAttemptId: 'apply', recordWitness: '{}' }));
  const view = { head, operation, request: { attemptId: 'apply', operation: 'interaction.apply',
    expected: { generation: head.generation, gameId: head.gameId, owner: head.owner, epoch: head.epoch, revision: head.revision },
    deadlineAt: null, input: { operationId: 'interact', sequence: 0 } },
    getExecution: vi.fn(), sourceReceipt: vi.fn(), savedSnapshot: vi.fn(), liveOperation: vi.fn(), knowledge: {}, appendExecution,
    progress: { ...pending, sourceAttemptId: 'apply', sequence: 1, status: 'applied',
      result: { kind: 'open-chest', outcome: 'applied', chestId: 'private-chest', lootIds: ['private-a', 'private-b'] } }, checkpoint: cp,
  } as unknown as OperationCommit<InteractionProgress>;
  return { hooks: interactionProgressHooks(identity, confirmation), view, bound, appendExecution, publication };
}

it.each([false, true])('uses the exact committed %s observation source without raw result IDs', async fresh => {
  const f = await fixture();
  await f.hooks.prepare(f.view);
  if (fresh) f.view.checkpoint.knowledge = { sequence: 2, id: 'new-sight', witness: 'new-sight-witness' };
  await f.hooks.commit(f.view);
  const value = f.appendExecution.mock.calls[0] as unknown as [string, { kind: string; data: { event: { observation: { data: unknown }; usage: unknown } } }];
  expect(value[1].kind).toBe('agentica-interaction-event');
  expect(value[1].data.event.observation.data).toMatchObject({ interaction: { kind: 'open-chest', outcome: 'applied', itemsReceived: 2 } });
  expect(JSON.stringify(value[1])).not.toMatch(/private-chest|private-a|private-b|lootIds|chestId|binding/);
  expect(value[1].data.event.usage).toEqual({});
  if (fresh) expect(value[1].data.event.observation.data).toMatchObject({ source: { sequence: 2, id: 'new-sight', revision: 8 } });
  await expect(f.hooks.commit(f.view)).rejects.toThrow('not prepared');
  expect(f.appendExecution).toHaveBeenCalledTimes(1);
});

it.each(['unconfirmed', 'unacknowledged', 'owner', 'epoch', 'stopped', 'guard', 'selection', 'replacement-selection', 'world', 'checkpoint',
  'foreign-operation', 'sequence', 'navigation', 'corrupt-selection'])(
  'rejects %s before domain work is authorized', async defect => {
    const f = await fixture();
    if (defect === 'unconfirmed') vi.mocked(loadOperationConfirmation).mockResolvedValue(null);
    if (defect === 'unacknowledged') vi.mocked(loadOperationCustodyAck).mockResolvedValue(null);
    if (defect === 'owner') f.view.head.owner = 'other';
    if (defect === 'epoch') f.view.head.epoch++;
    if (defect === 'stopped') f.view.head.status = 'stopped';
    if (defect === 'guard') f.bound.launch.guard.state = 'settled';
    if (defect === 'selection') vi.mocked(readPublicationSelection).mockResolvedValue(null);
    if (defect === 'replacement-selection') vi.mocked(readPublicationSelection).mockResolvedValue({ value: { data: {
      grant: f.bound.binding.grant, publication: { key: 'agentica/publication/new', id: 'new' },
    } } } as unknown as NonNullable<Awaited<ReturnType<typeof readPublicationSelection>>>);
    if (defect === 'world') f.view.head.roots.world = 'changed';
    if (defect === 'checkpoint') f.view.head.checkpoint = { changed: true };
    if (defect === 'foreign-operation') f.view.request.input = { operationId: 'foreign', sequence: 0 };
    if (defect === 'sequence') f.view.request.input = { operationId: 'interact', sequence: 1 };
    if (defect === 'navigation') f.bound.kind = 'navigation';
    if (defect === 'corrupt-selection') vi.mocked(readPublicationSelection).mockRejectedValue(new Error('bad selection witness'));
    await expect(f.hooks.prepare(f.view)).rejects.toThrow();
    await expect(f.hooks.commit(f.view)).rejects.toThrow();
    expect(f.appendExecution).not.toHaveBeenCalled();
  });

it('a failed prepare cannot reuse an earlier prepared command', async () => {
  const f = await fixture(); await f.hooks.prepare(f.view);
  vi.mocked(loadOperationCustodyAck).mockResolvedValue(null);
  await expect(f.hooks.prepare(f.view)).rejects.toThrow('not acknowledged');
  await expect(f.hooks.commit(f.view)).rejects.toThrow('not prepared');
});

it('fails closed when post-effect knowledge is corrupt', async () => {
  const f = await fixture(); await f.hooks.prepare(f.view);
  vi.mocked(validateKnowledge).mockRejectedValue(new Error('corrupt sight'));
  await expect(f.hooks.commit(f.view)).rejects.toThrow('corrupt sight');
  expect(f.appendExecution).not.toHaveBeenCalled();
});

it.each(['ineligible', 'foreign-chest', 'foreign-position', 'corrupt-source'])('revalidates %s original selection before an effect-capable apply', async defect => {
  const f = await fixture();
  if (defect === 'ineligible') vi.mocked(resolveChestSelection).mockResolvedValue(null);
  if (defect === 'foreign-chest') vi.mocked(resolveChestSelection).mockResolvedValue({ command: { kind: 'open-chest', chestId: 'other' }, position: f.view.checkpoint.position });
  if (defect === 'foreign-position') vi.mocked(resolveChestSelection).mockResolvedValue({ command: { kind: 'open-chest', chestId: 'private-chest' },
    position: { level: 1, cell: { spaceId: 'other', row: 0, column: 0 } } });
  if (defect === 'corrupt-source') vi.mocked(resolveChestSelection).mockRejectedValue(new Error('corrupt original sight'));
  await expect(f.hooks.prepare(f.view)).rejects.toThrow();
  expect(chestArgs).toHaveBeenCalledExactlyOnceWith({ target: 'public-token' }, f.bound.binding.publication);
  expect(f.appendExecution).not.toHaveBeenCalled();
});

it.each(['position-changed', 'unavailable'] as const)('allows only a no-effect %s domain result after harmless state drift', async reason => {
  const f = await fixture(), checkpoint = structuredClone(f.view.head.checkpoint);
  if (reason === 'position-changed') (checkpoint.position as { cell: { row: number } }).cell.row++;
  else checkpoint.mode = 'town';
  f.view.head.checkpoint = checkpoint;
  Object.assign(f.view, { checkpoint: gameCheckpoint(checkpoint) });
  Object.assign(f.view.progress, { status: 'blocked', reason, result: null });
  await f.hooks.prepare(f.view);
  expect(resolveChestSelection).not.toHaveBeenCalled();
  await f.hooks.commit(f.view);
  expect(f.appendExecution).toHaveBeenCalledTimes(1);
});

it.each(['position-changed', 'unavailable'] as const)('a stale %s prepare cannot commit an applied result', async reason => {
  const f = await fixture(), checkpoint = structuredClone(f.view.head.checkpoint);
  if (reason === 'position-changed') (checkpoint.position as { cell: { row: number } }).cell.row++;
  else checkpoint.mode = 'town';
  f.view.head.checkpoint = checkpoint;
  Object.assign(f.view, { checkpoint: gameCheckpoint(checkpoint) });
  await f.hooks.prepare(f.view);
  await expect(f.hooks.commit(f.view)).rejects.toThrow('must remain a no-effect blocked result');
  expect(f.appendExecution).not.toHaveBeenCalled();
});
