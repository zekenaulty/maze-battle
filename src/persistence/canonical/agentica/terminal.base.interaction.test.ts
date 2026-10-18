// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { loadInteractionTerminal } from '../interaction/terminal';
import { loadDestinationTerminal } from '../navigation/terminal';
import { loadOperationEvent } from './event.records';
import { loadOperationBinding } from './operation.binding';
import { loadOperationConfirmation } from './operation.confirmation';
import type { OperationRead } from './operation.types';
import { loadAgenticaTerminalBase } from './terminal.base';
import { loadTransfer } from './transfer.records';
import { protocolAction, protocolResult } from './types.test-support';
import { prepareAction } from './validation';

vi.mock('../interaction/terminal', () => ({ loadInteractionTerminal: vi.fn() }));
vi.mock('../navigation/terminal', () => ({ loadDestinationTerminal: vi.fn() }));
vi.mock('./operation.binding', () => ({ loadOperationBinding: vi.fn(), assertBoundAction: vi.fn(), captureOperationBinding: (v: unknown) => v }));
vi.mock('./operation.confirmation', () => ({ loadOperationConfirmation: vi.fn() }));
vi.mock('./event.records', () => ({ loadOperationEvent: vi.fn() }));
vi.mock('./transfer.records', () => ({ loadTransfer: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture(disposition: 'decision' | 'blocked' | 'cancelled', applied = true) {
  const identity = await prepareAction({ ...protocolAction(), capabilityId: 'maze.interact' });
  const binding = { grant: { key: 'grant', id: 'grant' }, publication: { key: 'pub', id: 'pub' } };
  const result = protocolResult(identity.action), progress = { sourceAttemptId: applied ? 'apply' : 'admit', sequence: applied ? 1 : 0,
    status: applied ? disposition === 'blocked' ? 'blocked' : 'applied' : 'pending', reason: disposition === 'blocked' ? 'unavailable' : null };
  const bound = { kind: 'interaction', operation: { id: 'interact', terminal: {} }, result, progress, start: { hostId: 'host' } };
  vi.mocked(loadOperationBinding).mockResolvedValue(bound as unknown as Awaited<ReturnType<typeof loadOperationBinding>>);
  vi.mocked(loadInteractionTerminal).mockResolvedValue({ disposition, terminal: { source: { attemptId: 'terminal' } } } as unknown as
    Awaited<ReturnType<typeof loadInteractionTerminal>>);
  const probe = { sequence: 1, sessionEpoch: '1', observation: result.observation };
  const event = { sequence: 2, sessionEpoch: '1', observation: { observationId: 'event-apply', revision: 20,
    observedAt: result.observation!.observedAt, data: { scope: 'actor', source: { id: 'post-effect' },
      interaction: { kind: 'open-chest', outcome: progress.status, itemsReceived: disposition === 'blocked' ? 0 : 2 } } } };
  vi.mocked(loadOperationConfirmation).mockResolvedValue(applied ? { data: { probe } } as unknown as NonNullable<Awaited<ReturnType<typeof loadOperationConfirmation>>> : null);
  vi.mocked(loadOperationEvent).mockResolvedValue({ source: { attemptId: 'apply' }, data: { event, previous: { kind: 'custody-probe' } } } as unknown as
    Awaited<ReturnType<typeof loadOperationEvent>>);
  vi.mocked(loadTransfer).mockResolvedValue(null);
  return { event, result, load: () => loadAgenticaTerminalBase({} as OperationRead, identity, binding) };
}

it('settles to an explicit decision without navigation counters or objective completion', async () => {
  const f = await fixture('decision'), terminal = (await f.load())!;
  expect(loadInteractionTerminal).toHaveBeenCalledExactlyOnceWith({}, 'interact');
  expect(loadDestinationTerminal).not.toHaveBeenCalled();
  expect(terminal.event).toMatchObject({ kind: 'decision', sequence: 3, eventId: 'terminal', usage: {}, observation: f.event.observation });
  expect(terminal.event.summary).toContain('explicit decision');
  expect(terminal.terminal.disposition).toBe('decision');
});

it('cancellation after apply preserves the original effect observation even without progress delivery ACK', async () => {
  const f = await fixture('cancelled'), terminal = (await f.load())!;
  expect(terminal.event).toMatchObject({ kind: 'cancelled', observation: f.event.observation, usage: {} });
  expect(terminal.event.summary).toContain('retained outcome: applied');
  expect(terminal.previous).toEqual(f.event);
});

it('cancellation before apply needs no confirmation and does not invent an effect event', async () => {
  const f = await fixture('cancelled', false), terminal = (await f.load())!;
  expect(terminal.event).toMatchObject({ kind: 'cancelled', sequence: 1, observation: f.result.observation, usage: {} });
  expect(terminal.event.summary).toContain('not applied');
  expect(loadOperationEvent).not.toHaveBeenCalled();
});

it('blocked apply remains blocked with its retained observation', async () => {
  const f = await fixture('blocked'), terminal = (await f.load())!;
  expect(terminal.event).toMatchObject({ kind: 'blocked', observation: f.event.observation, usage: {} });
});

it.each(['confirmation', 'event', 'source'])('missing or changed %s cannot erase a committed effect', async missing => {
  const f = await fixture('cancelled');
  if (missing === 'confirmation') vi.mocked(loadOperationConfirmation).mockResolvedValue(null);
  if (missing === 'event') vi.mocked(loadOperationEvent).mockRejectedValue(new Error('missing event'));
  if (missing === 'source') vi.mocked(loadOperationEvent).mockResolvedValue({ source: { attemptId: 'foreign' } } as unknown as Awaited<ReturnType<typeof loadOperationEvent>>);
  await expect(f.load()).rejects.toThrow();
});
