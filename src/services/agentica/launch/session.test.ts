import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LaunchSession } from './session';
import { DEFAULT_LAUNCH } from './configuration';
import type { LaunchJournal } from './journal';

const mock = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), check: vi.fn(), release: vi.fn(), lease: vi.fn(),
  construct: vi.fn(), start: vi.fn(), cancel: vi.fn(), tick: vi.fn(), close: vi.fn(), recover: vi.fn(),
  status: 'parked', unresolved: false, bound: false }));
vi.mock('./journal', async original => ({ ...await original<typeof import('./journal')>(),
  readLaunchJournal: mock.read, journalWriter: () => mock.write }));
vi.mock('./configuration', async original => ({ ...await original<typeof import('./configuration')>(), checkLab: mock.check }));
vi.mock('./lease', () => ({ claimLaunchLease: mock.lease }));
vi.mock('./telemetry', async original => ({ ...await original<typeof import('./telemetry')>(), readLaunchUsage: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../persistence/streamRepository', () => ({ loadStreamSnapshot: vi.fn().mockResolvedValue({}) }));
vi.mock('../directed/client', () => ({ DirectedAgenticaClient: class {
  constructor(options: unknown) { mock.construct(options); }
  get status() { return mock.status; }
  get unresolvedStart() { return mock.unresolved; }
  get currentRun() { return mock.bound ? { runId: 'run' } : undefined; }
  connected = true;
  start = mock.start; cancel = mock.cancel; tick = mock.tick; close = mock.close;
  recover = mock.recover;
} }));
const prepared = (): LaunchJournal => ({ version: 1, slot: 'test', phase: 'prepared', config: DEFAULT_LAUNCH,
  destinations: [{ label: 'Known cell', address: { spaceId: 'room', row: 1, column: 1 } }], selected: 0, events: [] });
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
let sessions: LaunchSession[] = [];
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); mock.status = 'parked'; mock.unresolved = false; mock.bound = false;
  let stored = prepared();
  mock.read.mockImplementation(async () => structuredClone(stored));
  mock.write.mockImplementation(async (value: LaunchJournal) => { stored = structuredClone(value); });
  mock.check.mockResolvedValue({}); mock.lease.mockResolvedValue(mock.release);
  mock.start.mockImplementation(async () => { mock.bound = true; return { runId: 'run' }; });
  mock.cancel.mockImplementation(async () => { mock.status = 'cancelled'; });
  mock.tick.mockResolvedValue(undefined); mock.close.mockResolvedValue(undefined);
  sessions = [];
});
afterEach(async () => { await Promise.all(sessions.map(session => session.close())); vi.useRealTimers(); });
async function open() { const session = new LaunchSession(() => undefined); sessions.push(session); await session.load(); return session; }

it('reload reads only, without constructing, connecting, moving or starting a client', async () => {
  mock.read.mockResolvedValue({ ...prepared(), phase: 'running', runId: 'existing' });
  const session = await open();
  expect(session.view.journal?.phase).toBe('recovery-required');
  expect(mock.construct).not.toHaveBeenCalled(); expect(mock.check).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
});
it.each(['stop', 'close'] as const)('%s during readiness prevents later paid start', async action => {
  const ready = gate<unknown>(); mock.check.mockReturnValue(ready.promise);
  const session = await open(), starting = session.start(DEFAULT_LAUNCH, 0);
  await vi.waitFor(() => expect(mock.check).toHaveBeenCalled());
  const stopping = session[action](); ready.resolve({});
  await starting; await stopping;
  expect(mock.construct).not.toHaveBeenCalled(); expect(mock.start).not.toHaveBeenCalled();
});
it('does not let double-clicks launch twice and forwards only configured provider options', async () => {
  const session = await open();
  await Promise.all([session.start(DEFAULT_LAUNCH, 0), session.start(DEFAULT_LAUNCH, 0)]);
  expect(mock.start).toHaveBeenCalledTimes(1);
  expect(mock.construct).toHaveBeenCalledWith(expect.objectContaining({ inspectOnArrival: true,
    provider: expect.objectContaining({ provider: 'openai', model: 'gpt-6-luna', thinkingEffort: 'high' }),
    limits: expect.objectContaining({ maxSteps: 8 }) }));
});
it('Stop cannot turn a lost start acknowledgement into permission for a replacement', async () => {
  mock.start.mockImplementation(async () => { mock.status = 'unresolved'; mock.unresolved = true; throw new Error('Unresolved start'); });
  const session = await open(); await session.start(DEFAULT_LAUNCH, 0); await session.stop();
  expect(session.view.journal?.phase).toBe('recovery-required');
  expect(session.view.journal?.runId).toBeUndefined();
  await session.prepare(DEFAULT_LAUNCH);
  expect(session.view.error).toContain('Resolve the retained launch');
  expect(mock.start).toHaveBeenCalledTimes(1);
});
it('a confirmed pre-dispatch cancellation remains cancelled when the pending start rejects', async () => {
  const waiting = gate<void>();
  mock.start.mockImplementation(async () => { await waiting.promise; throw new Error('Directed start was cancelled.'); });
  const session = await open(), starting = session.start(DEFAULT_LAUNCH, 0);
  await vi.waitFor(() => expect(mock.start).toHaveBeenCalled());
  const stopping = session.stop(); waiting.resolve(); await starting; await stopping;
  expect(session.view.journal?.phase).toBe('cancelled');
});
it('close drains an in-flight pump before releasing ownership, and cannot write after release', async () => {
  const waiting = gate<void>(); mock.tick.mockReturnValue(waiting.promise);
  const session = await open(); await session.start(DEFAULT_LAUNCH, 0);
  await vi.advanceTimersByTimeAsync(250);
  expect(mock.tick).toHaveBeenCalledTimes(1);
  const closing = session.close();
  await Promise.resolve(); expect(mock.release).not.toHaveBeenCalled();
  waiting.resolve(); await closing;
  const writes = mock.write.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(mock.release).toHaveBeenCalledTimes(1); expect(mock.write).toHaveBeenCalledTimes(writes);
});
it('rejected cancellation remains unresolved after the pending start rejects', async () => {
  const waiting = gate<void>();
  mock.start.mockImplementation(async () => { mock.bound = true; await waiting.promise; throw new Error('Start cancelled'); });
  mock.cancel.mockImplementation(async () => { mock.status = 'cancelled'; throw new Error('Remote stop rejected'); });
  const session = await open(), starting = session.start(DEFAULT_LAUNCH, 0);
  await vi.waitFor(() => expect(mock.start).toHaveBeenCalled());
  const stopping = session.stop(); waiting.resolve(); await starting; await stopping;
  expect(session.view.journal?.phase).toBe('recovery-required');
  expect(session.view.error).toBe('Remote stop rejected');
});
it.each(['stop', 'close'] as const)('%s during recovery teardown cannot construct a replacement client', async action => {
  const session = await open(); await session.start(DEFAULT_LAUNCH, 0);
  const waiting = gate<void>(); mock.close.mockReturnValue(waiting.promise);
  const recovering = session.recover();
  await vi.waitFor(() => expect(mock.close).toHaveBeenCalled());
  const stopping = session[action](); waiting.resolve(); await recovering; await stopping;
  expect(mock.construct).toHaveBeenCalledTimes(1);
  expect(mock.recover).not.toHaveBeenCalled();
});
