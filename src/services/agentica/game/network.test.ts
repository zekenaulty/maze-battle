import { describe, expect, it, vi } from 'vitest';
import { boundedGameFetch } from './network';

describe('canonical Agentica bounded HTTP', () => {
  it('preserves status/body, excludes credentials and redirects, and propagates caller abort', async () => {
    const controller = new AbortController(), http = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"code":"held"}', { status: 409 }));
    const response = await boundedGameFetch(controller.signal, http)('http://localhost/api/operations');
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ code: 'held' });
    const options = http.mock.calls[0][1]!;
    expect(options).toMatchObject({ redirect: 'error', credentials: 'omit' });
    controller.abort(); expect(options.signal?.aborted).toBe(true);
    await expect(boundedGameFetch(controller.signal, http)('http://localhost')).rejects.toThrow(); expect(http).toHaveBeenCalledTimes(1);
  });
  it('rejects an excessive declared size without consuming the body', async () => {
    const cancel = vi.fn(), body = new ReadableStream<Uint8Array>({ cancel });
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { headers: { 'content-length': '4194305' } }));
    await expect(boundedGameFetch(new AbortController().signal, http)('http://localhost')).rejects.toThrow('bounded inventory');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('rejects chunked overflow during reads, not after response.text', async () => {
    let reads = 0; const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel });
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(boundedGameFetch(new AbortController().signal, http)('http://localhost')).rejects.toThrow('bounded inventory');
    expect(reads).toBeLessThanOrEqual(6); expect(cancel).toHaveBeenCalledOnce();
  });
  it('aborts a stalled stream and never supplies a truncated inventory', async () => {
    const controller = new AbortController(), cancel = vi.fn();
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ cancel })));
    const response = boundedGameFetch(controller.signal, http)('http://localhost');
    await vi.waitFor(() => expect(http).toHaveBeenCalledOnce());
    controller.abort(new Error('host stopped'));
    await expect(response).rejects.toThrow('host stopped'); expect(cancel).toHaveBeenCalledOnce();
  });
  for (const declared of [true, false]) it(`does not await a never-settling cancel after ${declared ? 'declared' : 'streamed'} overflow`, async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(4194305)); }, cancel });
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(body,
      { headers: declared ? { 'content-length': '4194305' } : {} }));
    await expect(boundedGameFetch(new AbortController().signal, http)('http://localhost')).rejects.toThrow('bounded inventory');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
