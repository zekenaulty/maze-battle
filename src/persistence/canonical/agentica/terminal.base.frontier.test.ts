// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { loadDestinationTerminal } from '../navigation/terminal';
import { loadOperationBinding } from './operation.binding';
import { loadOperationConfirmation } from './operation.confirmation';
import { loadAgenticaTerminalBase } from './terminal.base';
import { prepareAction } from './validation';
import { protocolAction, protocolResult } from './types.test-support';
import type { OperationRead } from './operation.types';

vi.mock('../navigation/terminal', () => ({ loadDestinationTerminal: vi.fn() }));
vi.mock('./operation.binding', () => ({ loadOperationBinding: vi.fn(), assertBoundAction: vi.fn(),
  captureOperationBinding: (binding: unknown) => structuredClone(binding) }));
vi.mock('./operation.confirmation', () => ({ loadOperationConfirmation: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture(capability = 'maze.explore', disposition: 'completed' | 'blocked' | 'cancelled' = 'completed') {
  const identity = await prepareAction({ ...protocolAction(), capabilityId: capability });
  const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/pub', id: 'pub' } };
  const result = protocolResult(identity.action), bound = { operation: { id: 'travel', terminal: {} }, result,
    progress: { sequence: 0, steps: 0, replans: 0, reason: 'route-unavailable' }, start: { hostId: 'maze-battle' } };
  vi.mocked(loadOperationBinding).mockResolvedValue(bound as Awaited<ReturnType<typeof loadOperationBinding>>);
  vi.mocked(loadOperationConfirmation).mockResolvedValue(null);
  vi.mocked(loadDestinationTerminal).mockResolvedValue({ disposition,
    terminal: { source: { attemptId: 'terminal-original' } } } as Awaited<ReturnType<typeof loadDestinationTerminal>>);
  return (await loadAgenticaTerminalBase({} as OperationRead, identity, binding))!;
}

it('reports an approach decision, never completion or a newly selected frontier', async () => {
  const terminal = await fixture(), event = terminal.event;
  expect(event).toMatchObject({ kind: 'decision', actionId: 'action', operationId: 'travel', eventId: 'terminal-original', sequence: 1 });
  expect(event.summary).toBe('Selected frontier anchor reached. Further exploration requires an explicit decision; objective completion is not established.');
  expect(event.summary).toContain('frontier');
  expect(event.observation).toEqual(terminal.bound.result.observation);
  expect(event).not.toHaveProperty('completion');
});

it('preserves the original known-destination decision summary', async () => {
  expect((await fixture('maze.navigate')).event.summary).toBe('Destination reached. Objective completion requires a separate host proof.');
});

it.each(['blocked', 'cancelled'] as const)('keeps %s terminal semantics for explore', async disposition => {
  const terminal = await fixture('maze.explore', disposition);
  expect(terminal.event.kind).toBe(disposition);
  expect(terminal.event.eventId).toBe('terminal-original');
});
