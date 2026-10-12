import { expect, it, vi } from 'vitest';
import type { RpgLaunch } from '../../../persistence/rpgAgentica/launchRecords';
import type { HostOperationEvent } from '../sdk/agentica-host.mjs';
import type { RpgAgenticaTransport } from './transport';
import { stopRpgDecision } from './decisionStop';

const event: HostOperationEvent = { hostId: 'maze-battle', sessionId: 'session', sessionEpoch: '1', actionId: 'action',
  operationId: 'operation', sequence: 1, eventId: 'decision', kind: 'decision', summary: 'Reached the intermediate cell.',
  observation: { observationId: 'observed', revision: 2, observedAt: '2026-10-12T00:00:00Z', data: { column: 2 } } };
const receipt = () => ({ state: 'cancelled', latestEvent: structuredClone(event), stopDecision: structuredClone(event) });
const busy = () => Object.assign(new Error('Live successor is not settled.'), { code: 'session.busy' });
function fixture(knownChild = true) {
  const stopDecision = vi.fn().mockResolvedValue(receipt()), cancel = vi.fn().mockResolvedValue(undefined);
  const transport = { sdk: { stopDecision }, cancel, binding: { runId: 'child' } } as unknown as RpgAgenticaTransport;
  const launch = { wake: knownChild ? { binding: { runId: 'child' } } : undefined } as RpgLaunch;
  return { stopDecision, cancel, transport, launch };
}

it.each([false, true])('reconciles durable Stop after restart without requiring a live run (announced child=%s)', async knownChild => {
  const f = fixture(knownChild); await stopRpgDecision(f.transport, f.launch, event);
  expect(f.stopDecision).toHaveBeenCalledExactlyOnceWith(event, { fetchImpl: expect.any(Function) });
  expect(f.cancel).not.toHaveBeenCalled();
});
it('cancels only the known attached successor, then checks the original durable decision', async () => {
  const f = fixture(); f.stopDecision.mockRejectedValueOnce(busy());
  await stopRpgDecision(f.transport, f.launch, event);
  expect(f.cancel).toHaveBeenCalledExactlyOnceWith(false);
  expect(f.stopDecision).toHaveBeenCalledTimes(2);
  expect(f.stopDecision.mock.calls.map(call => call[0])).toEqual([event, event]);
});
it('does not infer a successor identity from a busy response', async () => {
  const f = fixture(false); f.stopDecision.mockRejectedValueOnce(busy());
  await expect(stopRpgDecision(f.transport, f.launch, event)).rejects.toThrow('Reconnect');
  expect(f.cancel).not.toHaveBeenCalled(); expect(f.stopDecision).toHaveBeenCalledTimes(1);
});
it('does not automatically retry an uncertain Stop or declare a busy successor stopped', async () => {
  const f = fixture(); f.stopDecision.mockRejectedValueOnce(new Error('Reply lost'));
  await expect(stopRpgDecision(f.transport, f.launch, event)).rejects.toThrow('Reply lost');
  expect(f.stopDecision).toHaveBeenCalledTimes(1); expect(f.cancel).not.toHaveBeenCalled();
  f.stopDecision.mockRejectedValue(busy());
  await expect(stopRpgDecision(f.transport, f.launch, event)).rejects.toThrow('not settled');
  expect(f.cancel).toHaveBeenCalledExactlyOnceWith(false);
});
it.each(['state', 'stopDecision', 'latestEvent'])('requires exact durable cancellation evidence: %s', async field => {
  const f = fixture(), changed = { ...receipt(), [field]: field === 'state' ? 'waking' : { ...event, eventId: 'replacement' } };
  f.stopDecision.mockResolvedValue(changed);
  await expect(stopRpgDecision(f.transport, f.launch, event)).rejects.toThrow('different decision');
  expect(f.cancel).not.toHaveBeenCalled();
});
