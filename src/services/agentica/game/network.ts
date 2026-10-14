const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/** Bound bytes while receiving, before the SDK's response.text() allocation; redirects carry no authority. */
export function boundedGameFetch(signal: AbortSignal, fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(10_000), ...(init?.signal ? [init.signal] : [])]);
    combined.throwIfAborted();
    const response = await fetchImpl(input, { ...init, signal: combined, redirect: 'error', credentials: 'omit' });
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
      void response.body?.cancel().catch(() => {}); throw new Error('Agentica response exceeds the bounded inventory size.');
    }
    const reader = response.body?.getReader(), chunks: Uint8Array[] = [];
    const abort = () => { void reader?.cancel(combined.reason).catch(() => {}); };
    combined.addEventListener('abort', abort, { once: true });
    let size = 0;
    try {
      if (reader) for (;;) {
        combined.throwIfAborted(); const { done, value } = await reader.read(); combined.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new Error('Agentica response exceeds the bounded inventory size.');
        chunks.push(value);
      }
    } catch (error) { void reader?.cancel().catch(() => {}); throw error; }
    finally { combined.removeEventListener('abort', abort); reader?.releaseLock(); }
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return new Response([204, 205, 304].includes(response.status) ? null : body,
      { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
