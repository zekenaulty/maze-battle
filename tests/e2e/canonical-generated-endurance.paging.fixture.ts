import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { listKnownNodes } from '../../src/persistence/canonical/knowledge/graph';
import { readCanonical } from '../../src/persistence/canonical/read';
import { jsonBytes } from '../../src/persistence/canonical/validation';
import { connections } from './canonical-generated-endurance.recall';
import { session } from './canonical-revisit.fixture';
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

/** Declared depth-query width only; the UI and played-journey room pager remain size 4. */
export function roomPage(cursor?: string) {
  const snapshot = session().view.game!.snapshot;
  return measure(() => readCanonical(async (pages, pinned) => {
    const checkpoint = gameCheckpoint(pinned.checkpoint);
    const page = await listKnownNodes(pages, checkpoint, { level: checkpoint.position.level, kind: 'room', limit: 2,
      ...(cursor === undefined ? {} : { cursor }) });
    jsonBytes(page, 4096); return page;
  }, { snapshot }));
}
export const connectionPage = (spaceId: string, cursor?: string) => measure(() => connections(spaceId, cursor));
