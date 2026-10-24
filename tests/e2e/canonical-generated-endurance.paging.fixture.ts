import { rooms, connections } from './canonical-generated-endurance.recall';
import { startProbe, finishProbe } from './canonical-revisit.probe';

export interface MeteredPage<T> {
  result: T | undefined;
  error: string | null;
  payloadBytes: number | null;
  native: Awaited<ReturnType<typeof finishProbe>>;
}

/** Preserve native failures too; assertions and selection happen after the meter is stopped. */
async function measure<T extends { value: unknown }>(read: () => Promise<T>): Promise<MeteredPage<T>> {
  let result: T | undefined, error: string | null = null;
  let native: Awaited<ReturnType<typeof finishProbe>>;
  await startProbe();
  try { result = await read(); }
  catch (cause) { error = String(cause); }
  finally { native = await finishProbe(); }
  return { result, error, native,
    payloadBytes: result === undefined ? null : new TextEncoder().encode(JSON.stringify(result.value)).byteLength };
}

export const roomPage = (cursor?: string) => measure(() => rooms(cursor));
export const connectionPage = (spaceId: string, cursor?: string) => measure(() => connections(spaceId, cursor));
