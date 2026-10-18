// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import type { CanonicalRecoveryPort } from '../../game/CanonicalHostRecovery';
import type { AgenticaOperationEntry } from '../sdk/agentica-host.mjs';
import { launchStartFixture } from '../../../persistence/canonical/agentica/launch.test-support';
import { protocolAction, protocolResult } from '../../../persistence/canonical/agentica/types.test-support';
import { createGameOperationDriver } from './operationDriver';
import { deferred } from './transportGate';

const m = vi.hoisted(() => ({ read: vi.fn(), binding: vi.fn(), operation: vi.fn(), live: vi.fn() }));
vi.mock('../../../persistence/canonical/read', () => ({ readCanonical: m.read }));
vi.mock('../../../persistence/canonical/agentica/operation.binding', async original => ({
  ...await original<object>(), loadOperationBinding: m.binding,
}));
vi.mock('../../../persistence/canonical/agentica/operation', async original => ({
  ...await original<object>(), readAgenticaOperation: m.operation,
}));

const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/publication', id: 'publication' } };
const action = { ...protocolAction(), capabilityId: 'maze.navigate' };
const start = { ...launchStartFixture(), objective: 'Exact current run grant, not the initial root.' };
const parked = (): AgenticaOperationEntry => ({ request: structuredClone(start), action: structuredClone(action),
  admission: { ...protocolResult(action), operation: { operationId: 'navigation', summary: 'Admitted navigation.' } },
  activeEpoch: action.sessionEpoch, state: 'parked', usage: { steps: 1, refinements: 0, continuations: 0, providerCalls: 1 } });
const reserved = () => ({ ...parked(), state: 'reserved', admission: null } as unknown as AgenticaOperationEntry);
const sdk = { listOperations: vi.fn(), signalOperation: vi.fn(), stopDecision: vi.fn() };
const submit = vi.fn<CanonicalHostPort['submitHostCommand']>(), cleanup = vi.fn<CanonicalRecoveryPort['cleanupHostOperation']>();
let host: AbortController, driver: Awaited<ReturnType<typeof createGameOperationDriver>> | undefined;
const attach = async () => driver = await createGameOperationDriver({ hostSignal: host.signal,
  submitHostCommand: submit, cleanupHostOperation: cleanup }, sdk, action, binding);
const expectReadOnly = () => {
  expect(submit).not.toHaveBeenCalled(); expect(cleanup).not.toHaveBeenCalled();
  expect(sdk.signalOperation).not.toHaveBeenCalled(); expect(sdk.stopDecision).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.resetAllMocks(); host = new AbortController();
  m.live.mockResolvedValue({ generation: 'generation', gameId: 'game', id: 'navigation' });
  m.read.mockImplementation(async read => ({ head: { generation: 'generation', gameId: 'game' },
    value: await read({ liveOperation: m.live }) }));
  m.binding.mockResolvedValue({ start: structuredClone(start),
    operation: { generation: 'generation', gameId: 'game', id: 'navigation' },
    launch: { guard: { id: 'root' }, binding: { start: launchStartFixture() } } });
  m.operation.mockResolvedValue({ value: null }); sdk.listOperations.mockResolvedValue([reserved()]);
});
afterEach(() => { driver?.close(); driver = undefined; });

describe('operation driver before service admission', () => {
  it('waits read-only for reserved inventory, then confirms only after the service parks it', async () => {
    const pending = deferred<AgenticaOperationEntry[]>(), readStarted = deferred<void>();
    sdk.listOperations.mockImplementationOnce(() => { readStarted.resolve(); return pending.promise; });
    const d = await attach(), first = d.pulse();
    await readStarted.promise; expectReadOnly();
    const row = reserved(), original = structuredClone(row);
    pending.resolve([row]);
    await expect(first).resolves.toEqual({ status: 'awaiting-service' });
    expect(row).toEqual(original); expectReadOnly();
    await expect(d.pulse()).resolves.toEqual({ status: 'awaiting-service' }); expectReadOnly();
    sdk.listOperations.mockResolvedValue([parked()]);
    await expect(d.pulse()).resolves.toEqual({ status: 'confirmed' });
    expect(submit).toHaveBeenCalledOnce(); expect(submit.mock.calls[0][0]).toMatchObject({
      kind: 'fresh', operation: 'agentica.operation.confirm', input: { binding, entry: parked() }, signal: host.signal,
    });
    expect(m.binding).toHaveBeenCalledOnce(); expect(m.read).toHaveBeenCalledTimes(4);
    expect(cleanup).not.toHaveBeenCalled(); expect(sdk.signalOperation).not.toHaveBeenCalled();
  });

  it.each([
    ['request', (e: AgenticaOperationEntry) => { e.request.objective = 'Other request'; }],
    ['action', (e: AgenticaOperationEntry) => { e.action.arguments.row = 12; }],
    ['active epoch', (e: AgenticaOperationEntry) => { e.activeEpoch = '2'; }],
    ['admission', (e: AgenticaOperationEntry) => { e.admission = parked().admission; }],
    ['latest event', (e: AgenticaOperationEntry) => { Object.assign(e, { latestEvent: {} }); }],
    ['wake', (e: AgenticaOperationEntry) => { e.wakeRunId = 'wake'; }],
    ['stop', (e: AgenticaOperationEntry) => { Object.assign(e, { stopDecision: {} }); }],
    ['settlement', (e: AgenticaOperationEntry) => { Object.assign(e, { settledUsage: e.usage }); }],
    ['usage', (e: AgenticaOperationEntry) => { e.usage.steps = -1; }],
  ] as const)('rejects a reserved row with invalid %s before queue submission', async (_label, mutate) => {
    const row = reserved(); mutate(row); sdk.listOperations.mockResolvedValue([row]);
    const d = await attach(); await expect(d.pulse()).rejects.toThrow(); expectReadOnly();
    sdk.listOperations.mockResolvedValue([parked()]);
    await expect(d.pulse()).resolves.toEqual({ status: 'confirmed' }); expect(submit).toHaveBeenCalledOnce();
  });

  it('does not select an unrelated reservation or accept ambiguous matching rows', async () => {
    const row = reserved(); row.action.runId = 'other-run'; sdk.listOperations.mockResolvedValue([row]);
    const d = await attach(); await expect(d.pulse()).resolves.toEqual({ status: 'awaiting-service' }); expectReadOnly();
    sdk.listOperations.mockResolvedValue([reserved(), parked()]);
    await expect(d.pulse()).rejects.toThrow('ambiguous service operation custody'); expectReadOnly();
  });

  it('rejects a late reserved response after the host lifetime ends', async () => {
    const pending = deferred<AgenticaOperationEntry[]>(), readStarted = deferred<void>();
    sdk.listOperations.mockImplementationOnce(() => { readStarted.resolve(); return pending.promise; });
    const d = await attach(), pulse = d.pulse(), rejection = expect(pulse).rejects.toThrow();
    await readStarted.promise; host.abort(); pending.resolve([reserved()]);
    await rejection; expectReadOnly();
  });
});
