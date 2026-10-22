// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { GameSession } from '../../game/GameSession';
import { inspectActiveNavigation, resumeActiveNavigation } from './playActiveNavigation';
import { adoptionFixture } from './playAdoption.test-support';
import { createGamePlayController } from './playController';
import type { AgenticaHost } from '../sdk/agentica-host.mjs';

const m = vi.hoisted(() => ({ inspect: vi.fn(), confirm: vi.fn(), operation: vi.fn(), select: vi.fn(), intent: vi.fn(), ack: vi.fn(),
  read: vi.fn(), transfer: vi.fn(), prepare: vi.fn(), pulse: vi.fn(), close: vi.fn(), publish: vi.fn(), navigate: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: async (signal: AbortSignal, fn: (s: AbortSignal) => unknown) => fn(signal) }));
vi.mock('../../../persistence/canonical/agentica/recovery.inspect', () => ({ inspectAgenticaRecovery: m.inspect }));
vi.mock('../../../persistence/canonical/agentica/actions', () => ({ prepareAction: async (action: unknown) => ({ action }) }));
vi.mock('../../../persistence/canonical/read', () => ({ readCanonical: m.read }));
vi.mock('../../../persistence/canonical/agentica/operation.confirmation', () => ({ loadOperationConfirmation: m.confirm }));
vi.mock('../../../persistence/canonical/agentica/operation', () => ({ loadAgenticaOperation: m.operation }));
vi.mock('../../../persistence/canonical/agentica/publication-selection', () => ({ readPublicationSelection: m.select }));
vi.mock('../../../persistence/canonical/agentica/transfer.records', () => ({ loadTransfer: m.intent, loadTransferAck: m.ack }));
vi.mock('./operationTransfer', () => ({ createGameOperationTransfer: m.transfer }));
vi.mock('./publication', () => ({ publishGamePublication: m.publish }));
vi.mock('./playNavigation', () => ({ startPlayNavigation: m.navigate }));

let f: ReturnType<typeof adoptionFixture>, session: GameSession, host: AbortController;
const progress = () => ({ schema: 1, operationId: 'navigation', binding: { kind: 'known-destination', target: { level: 1,
  cell: { spaceId: 'earned', row: 2, column: 0 } }, limits: { steps: 64, replans: 4, durationMs: 120000 } },
  sequence: 1, steps: 1, replans: 0, startedAt: 1000, deadline: 121000, status: 'running', owner: 'owner', epoch: 1 });
beforeEach(() => {
  vi.resetAllMocks(); f = adoptionFixture(); host = new AbortController();
  session = { owner: f.fence.owner, get hostSignal() { return host.signal; }, view: { controlled: true,
    game: { mode: 'manual', snapshot: f.fence } }, flush: vi.fn(async () => {}), acquireAgenticControl: vi.fn(() => vi.fn()),
    submitHostCommand: vi.fn(), cleanupHostOperation: vi.fn() } as unknown as GameSession;
  m.inspect.mockResolvedValue({ ...f.inspected, operation: { state: 'admitted' }, progress: progress(), terminal: null });
  m.read.mockImplementation(async fn => ({ head: f.view.head, value: await fn({}) }));
  m.confirm.mockImplementation(async () => ({ data: { binding: f.original.binding }, bound: { ...f.view.value.terminal.bound,
    kind: 'navigation', operation: { state: 'admitted', owner: 'owner', epoch: 1 } } }));
  m.operation.mockImplementation(async () => ({ kind: 'navigation', progress: progress(), custodyAck: {}, event: {}, acknowledgement: {} }));
  m.select.mockImplementation(async () => ({ value: { data: f.original.binding } }));
  m.intent.mockResolvedValue(null); m.ack.mockResolvedValue(null);
  m.transfer.mockResolvedValue({ prepare: m.prepare, pulse: m.pulse, close: m.close });
  m.publish.mockResolvedValue({ key: 'current-earned', id: 'publication' });
  m.navigate.mockResolvedValue({ close: vi.fn() });
});
const inspect = () => inspectActiveNavigation(session, f.fence, f.candidate);
const factory = () => ({ close: vi.fn() }) as unknown as AgenticaHost;
const resume = async () => resumeActiveNavigation(session, (await inspect())!, host.signal, vi.fn(), vi.fn(), factory);
function authorize() {
  for (const status of ['transfer-acknowledged', 'kernel-adopted', 'kernel-adopted', 'navigation-authorized']) m.pulse.mockResolvedValueOnce({ status });
}

it('inspection exposes exact original progress/profile without effects', async () => {
  const offer = await inspect(); expect(offer!.original).toEqual(f.original); expect(offer!.progress).toEqual(progress());
  expect(offer!.profile.limits).toEqual(f.entry.request.limits);
  expect(m.transfer).not.toHaveBeenCalled(); expect(m.publish).not.toHaveBeenCalled(); expect(session.submitHostCommand).not.toHaveBeenCalled();
});
it.each(['owner', 'revision', 'mode', 'busy', 'lifetime'])('rejects changed %s before resuming', async reason => {
  const offer = (await inspect())!;
  if (reason === 'owner') Reflect.set(session, 'owner', 'different');
  if (reason === 'revision') f.fence.revision++;
  if (reason === 'mode') session.view.game!.mode = 'town';
  if (reason === 'busy') session.view.busy = true;
  if (reason === 'lifetime') host.abort();
  await expect(resumeActiveNavigation(session, offer, host.signal, vi.fn(), vi.fn(), factory)).rejects.toThrow();
  expect(m.transfer).not.toHaveBeenCalled(); expect(m.navigate).not.toHaveBeenCalled();
});
it.each(['interaction', 'settled', 'decision', 'claim'])('does not offer %s', async reason => {
  const value = await m.inspect();
  if (reason === 'interaction') value.action = { ...value.action, capabilityId: 'maze.interact' };
  if (reason === 'settled') value.operation.state = 'settled';
  if (reason === 'decision') value.decision = {};
  if (reason === 'claim') value.claim = {};
  expect(await inspect()).toBeNull();
});
it('rejects unacknowledged progress and mismatched selected binding', async () => {
  m.operation.mockResolvedValueOnce({ kind: 'navigation', custodyAck: {}, event: {}, acknowledgement: null });
  await expect(inspect()).rejects.toThrow('acknowledged progress');
  m.select.mockResolvedValueOnce(null); await expect(inspect()).rejects.toThrow('selected grant');
});
it('publishes once, authorizes through all four stages, then attaches the same action/binding', async () => {
  authorize(); const offer = (await inspect())!, runner = await resume();
  expect(m.prepare).toHaveBeenCalledExactlyOnceWith({ key: 'current-earned', id: 'publication' });
  expect(m.pulse).toHaveBeenCalledTimes(4);
  expect(m.navigate).toHaveBeenCalledWith(session, expect.anything(), offer.original.action, offer.original.binding,
    expect.any(AbortSignal), expect.any(Function), expect.any(Function));
  runner.close();
});
it('a lost ACK stops; explicit reinspection retries the retained intent without republishing', async () => {
  m.pulse.mockRejectedValueOnce(Error('lost service ACK')); await expect(resume()).rejects.toThrow('lost service ACK');
  expect(m.navigate).not.toHaveBeenCalled();
  m.intent.mockResolvedValue({ source: { expected: f.fence }, reference: { key: 'intent', id: 'original' } });
  authorize(); const runner = await resume();
  expect(m.prepare).toHaveBeenCalledTimes(1); expect(m.publish).toHaveBeenCalledTimes(1); runner.close();
});
it('reconciles an older lost ACK before a newly inspected owner prepares another transfer', async () => {
  m.intent.mockResolvedValue({ source: { expected: { ...f.fence, epoch: 1 } } });
  m.pulse.mockResolvedValueOnce({ status: 'transfer-acknowledged' }); authorize();
  const runner = await resume(); expect(m.pulse).toHaveBeenCalledTimes(5);
  expect(m.pulse.mock.invocationCallOrder[0]).toBeLessThan(m.prepare.mock.invocationCallOrder[0]); runner.close();
});
it('does not attach navigation after takeover-required or a lost owner during ACK', async () => {
  m.pulse.mockResolvedValueOnce({ status: 'takeover-required' }); await expect(resume()).rejects.toThrow('owner changed');
  m.pulse.mockImplementationOnce(async () => { host.abort(); return { status: 'transfer-acknowledged' }; });
  await expect(resume()).rejects.toThrow(); expect(m.navigate).not.toHaveBeenCalled();
});
it('mounted Resume rejects duplicate activation before any second transfer', async () => {
  authorize(); const controller = createGamePlayController(session, vi.fn(), factory), offer = (await inspect())!;
  const first = controller.resumeNavigation(offer);
  expect(() => controller.resumeNavigation(offer)).toThrow('inactive'); await first;
  expect(m.transfer).toHaveBeenCalledTimes(1); controller.close();
});
