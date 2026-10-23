import { afterEach, beforeEach, expect, test, vi } from 'vitest';

class MemorySocket extends EventTarget {
  static forwarded: unknown[] = [];
  send(data: string | BufferSource | Blob) { MemorySocket.forwarded.push(data); }
}
beforeEach(() => { vi.resetModules(); MemorySocket.forwarded = []; vi.stubGlobal('WebSocket', MemorySocket); });
afterEach(() => vi.unstubAllGlobals());

test('held progress never invokes fetch or resolves, while admission probes pass unchanged', async () => {
  const native = vi.fn(async () => new Response('{}')); vi.stubGlobal('fetch', native);
  const { holdProgressBeforeDispatch, preacceptanceFault } = await import('./canonical-start-service.corpus-preacceptance.fault');
  holdProgressBeforeDispatch('original');
  const url = 'http://offline.invalid/api/operations/events';
  const body = JSON.stringify({ actionId: 'original', sequence: 2, eventId: 'event' });
  let resolved = false;
  void fetch(url, { method: 'POST', body }).then(() => { resolved = true; });
  await Promise.resolve(); expect(native).not.toHaveBeenCalled(); expect(resolved).toBe(false);
  expect(preacceptanceFault()!.attempts).toEqual([{ url, serialized: body, payload: JSON.parse(body) }]);
  await fetch(url, { method: 'POST', body: JSON.stringify({ actionId: 'original', sequence: 1 }) });
  expect(native).toHaveBeenCalledOnce(); expect(resolved).toBe(false);
});

test('completion attempts on every socket are retained without native dispatch or fabricated confirmation', async () => {
  const { holdCompletionBeforeDispatch, preacceptanceFault } = await import('./canonical-start-service.corpus-preacceptance.fault');
  holdCompletionBeforeDispatch();
  const frame = JSON.stringify({ type: 'action.result', runId: 'run', payload: { actionId: 'original', completion: { evidenceId: 'proof' } } });
  for (let attempt = 0; attempt < 2; attempt++) new WebSocket('ws://offline.invalid').send(frame);
  expect(preacceptanceFault()!.attempts).toEqual(Array(2).fill({ serialized: frame, payload: JSON.parse(frame) }));
  expect(MemorySocket.forwarded).toEqual([]);
  new WebSocket('ws://offline.invalid').send('{"type":"operation.wake"}');
  expect(MemorySocket.forwarded).toEqual(['{"type":"operation.wake"}']);
  const copy = preacceptanceFault()!; copy.attempts.length = 0; expect(preacceptanceFault()!.attempts).toHaveLength(2);
});
