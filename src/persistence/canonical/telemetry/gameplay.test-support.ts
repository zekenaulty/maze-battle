import { vi } from 'vitest';
import { executeBattleCommand } from '../combat/command';
import { mechanicsFixture } from '../combat/mechanics.test-support';
import { snapshotOf } from '../read';
import { readGameplayTelemetry } from './records';

export async function started(mode: 'manual' | 'auto-play' | 'waves' = 'manual') {
  const f = await mechanicsFixture(); f.storage.install(); vi.spyOn(Math, 'random').mockReturnValue(0);
  await executeBattleCommand(f.request({ kind: 'start', returnMode: mode }));
  return f;
}
export const trace = (f: Pick<Awaited<ReturnType<typeof mechanicsFixture>>, 'head'>) => readGameplayTelemetry(snapshotOf(f.head()));
