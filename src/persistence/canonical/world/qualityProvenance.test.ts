import { expect, it } from 'vitest';
import { assertModuleQuality } from '../../../domain/expedition/topology/modules/quality';
import { advanceWorldFloorQuality, beginWorldFloorQuality, loadWorldQuality, requireWorldFloorQuality } from './quality';
import { finishQuality, qualityFixture, qualityMemory } from './quality.test-support';
import { chainRecords } from './qualityChain.test-support';
import { twoArmChain } from './qualityProvenance.test-support';

async function beforeRoot(m: ReturnType<typeof qualityMemory>) {
  let state = await beginWorldFloorQuality(m.pages, 1);
  while (state.nextRoom > 0) state = await advanceWorldFloorQuality(m.pages, 1, Math.min(4, state.nextRoom));
  return state;
}

it('control: unmodified two-arm chain fails both full D1 and canonical qualification', async () => {
  const m = twoArmChain();
  expect(() => assertModuleQuality(m.assembly)).toThrow('structural qualification');
  expect(await finishQuality(m)).toMatchObject({ status: 'failed', metrics: { rooms: 13, forks: 0, longestChain: 12 } });
});

it('rejects re-versioned non-cursor node 2 with unchanged source witnesses', async () => {
  const m = twoArmChain(), cursor = await beforeRoot(m), key = 'dungeon/1/quality/node/2';
  const prior = m.rows.get(key)!, forged = structuredClone(m.value(key));
  forged.arm = 1; forged.metrics.forks = 2; forged.metrics.longestChain = 0;
  const replacement = m.put(key, forged);
  expect(replacement.id).not.toBe(prior.id); expect(cursor.nextRoom).toBe(0);
  expect(m.value('dungeon/1/quality/progress')).toEqual(cursor);
  m.clear();
  await expect(advanceWorldFloorQuality(m.pages, 1, 1)).rejects.toThrow('quality node namespace');
  expect(m.writes).toEqual([]);
});

it.each(['connection', 'passage'])('rejects deletion of a processed remote %s before final reduction', async kind => {
  const m = qualityFixture(781, 25, kind === 'passage' ? 'passage' : 'direct'); await beforeRoot(m);
  const join = m.assembly.joins.find(j => j.fromRoomId !== 'entry')!;
  expect(m.rows.delete(`dungeon/1/${kind === 'passage' ? `space/${join.passageId}` : `connection/${join.id}:door`}`)).toBe(true);
  m.clear(); await expect(advanceWorldFloorQuality(m.pages, 1, 1)).rejects.toThrow('quality binding');
  expect(m.writes).toEqual([]);
});

it.each(['running', 'failed', 'qualified'])('cannot restart surviving %s scratch with both controls missing', async status => {
  const m = status === 'failed' ? qualityMemory() : qualityFixture();
  if (status === 'failed') m.fallback(chainRecords(13).read);
  if (status === 'running') { await beginWorldFloorQuality(m.pages, 1); await advanceWorldFloorQuality(m.pages, 1); }
  else expect((await finishQuality(m)).status).toBe(status);
  m.rows.delete('dungeon/1/quality'); m.rows.delete('dungeon/1/quality/progress'); m.clear();
  await expect(beginWorldFloorQuality(m.pages, 1)).rejects.toThrow('surviving nodes');
  expect(m.writes).toEqual([]);
});

it.each(['scratch', 'space', 'ports', 'join', 'connection'])('terminal admission rejects re-versioned %s', async kind => {
  const m = qualityFixture(781, 25, 'direct'); await finishQuality(m);
  const key = `dungeon/1/${{ scratch: 'quality/node/2', space: 'space/socket-1:room', ports: 'ports/socket-1:room',
    join: 'join/socket-1', connection: 'connection/socket-1:door' }[kind]}`;
  m.put(key, m.value(key)); m.clear();
  for (const run of [beginWorldFloorQuality, advanceWorldFloorQuality, loadWorldQuality, requireWorldFloorQuality]) {
    await expect(run(m.pages, 1)).rejects.toThrow();
  }
  expect(m.writes).toEqual([]);
});

it('does not downgrade quality on a read facade without namespace witnesses', async () => {
  const m = qualityFixture(); await finishQuality(m);
  const read = { get: m.pages.get, scan: m.pages.scan };
  await expect(requireWorldFloorQuality(read, 1)).rejects.toThrow('requires primary namespace witnesses');
});
