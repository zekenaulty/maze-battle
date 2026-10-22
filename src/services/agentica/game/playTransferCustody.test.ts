// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { assertTransferredDecision } from './playTransferCustody';
import { adoptionFixture } from './playAdoption.test-support';
import type { DecisionView } from './decisionState';

const m = vi.hoisted(() => ({ read: vi.fn(), get: vi.fn(), authority: vi.fn(), event: vi.fn() }));
vi.mock('../../../persistence/canonical/read', () => ({ readCanonical: m.read }));
vi.mock('../../../persistence/canonical/agentica/event.records', () => ({ loadOperationEvent: m.event }));
vi.mock('../../../persistence/canonical/agentica/transfer.records', () => ({ loadTransferAuthority: m.authority,
  transferStageKey: (ref: { key: string }, stage: string) => `${ref.key}/${stage}` }));

let view: DecisionView;
beforeEach(() => {
  vi.resetAllMocks(); const f = adoptionFixture(), original = f.view.value.terminal;
  const owner = { owner: f.fence.owner, epoch: f.fence.epoch };
  view = { ...f.view, value: { ...f.view.value, terminal: { ...original,
    event: { ...original.event, sessionEpoch: '2' },
    transfer: { reference: { key: 'transfer', id: 'intent' }, data: { navigationSequence: 1 } },
    terminal: { terminal: { source: { expected: owner }, receipt: { beforeRevision: 28, afterRevision: 29 } } },
    bound: { ...original.bound, kind: 'navigation', progress: { ...owner, sequence: 22, sourceAttemptId: 'final-move' },
      operation: { ...owner, state: 'settled', revision: 29 },
      launch: { ...original.bound.launch, guard: { ...original.bound.launch.guard, ...owner, revision: 23 } } },
  } } } as unknown as DecisionView;
  m.read.mockImplementation(async fn => ({ head: view.head, value: await fn({ get: m.get }) }));
  m.get.mockResolvedValue({ id: 'authority' });
  m.authority.mockResolvedValue({ reference: { key: 'transfer/authority', id: 'authority' },
    transfer: view.value.terminal.transfer, source: { expected: owner }, data: { guardRevision: 23 }, row: { revision: 25 } });
  m.event.mockResolvedValue({ data: { authority: { key: 'transfer/authority', id: 'authority' } },
    source: { attemptId: 'final-move' }, row: { revision: 28 } });
});
it('derives current settled custody from validated authority, named-adoption proof and terminal progress', async () => {
  await assertTransferredDecision(view);
  expect(m.authority).toHaveBeenCalledWith(expect.anything(), view.value.terminal.identity, view.value.terminal.confirmed,
    { key: 'transfer/authority', id: 'authority' }); expect(m.event).toHaveBeenCalledTimes(1);
});
it.each(['interaction', 'old-owner', 'admitted', 'missing-transfer', 'same-original-epoch', 'terminal-epoch', 'guard-revision', 'terminal-revision'])
('refuses %s without widening ordinary custody', async defect => {
  const t = view.value.terminal;
  if (defect === 'interaction') t.bound.kind = 'interaction';
  if (defect === 'old-owner') t.bound.operation.owner = 'old';
  if (defect === 'admitted') t.bound.operation.state = 'admitted';
  if (defect === 'missing-transfer') t.transfer = null;
  if (defect === 'same-original-epoch') t.identity = { ...t.identity, action: { ...t.identity.action, sessionEpoch: '2' } };
  if (defect === 'terminal-epoch') t.event.sessionEpoch = '1';
  if (defect === 'guard-revision') t.bound.launch.guard.revision++;
  if (defect === 'terminal-revision') t.bound.operation.revision++;
  await expect(assertTransferredDecision(view)).rejects.toThrow();
});
it.each(['authority', 'ACK', 'guard receipt', 'navigation receipt'])('propagates missing/corrupt %s proof', async defect => {
  if (defect === 'authority') m.get.mockResolvedValue(null);
  else m.authority.mockRejectedValue(Error(`Invalid ${defect}`));
  await expect(assertTransferredDecision(view)).rejects.toThrow();
});
it('rejects a final event from another authority and a changed read fence', async () => {
  const event = await m.event(); event.data.authority.id = 'other';
  await expect(assertTransferredDecision(view)).rejects.toThrow('chain changed');
  event.data.authority.id = 'authority';
  m.read.mockImplementation(async fn => ({ head: { ...view.head, revision: view.head.revision + 1 }, value: await fn({ get: m.get }) }));
  await expect(assertTransferredDecision(view)).rejects.toThrow('fence changed');
});
