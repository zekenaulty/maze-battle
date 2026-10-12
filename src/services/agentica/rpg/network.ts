/** Administrative reads are bounded too; Stop must not wait forever for inventory. */
export const rpgFetch = (signal?: AbortSignal): typeof fetch => (input, init) => fetch(input, { ...init,
  signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
