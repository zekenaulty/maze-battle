import { expect, it } from 'vitest';
import { advanceWorldFloorQuality, beginWorldFloorQuality, loadWorldQuality, requireWorldFloorQuality } from './quality';
import { finishQuality, qualityFixture } from './quality.test-support';

it.each(['progress', 'node', 'anchor', 'floor'] as const)('missing established %s cannot restart qualification', async what => {
  const m = qualityFixture(); await beginWorldFloorQuality(m.pages, 1); await advanceWorldFloorQuality(m.pages, 1, 1);
  m.rows.delete({ progress: 'dungeon/1/quality/progress', node: 'dungeon/1/quality/node/24',
    anchor: 'dungeon/1/quality', floor: 'dungeon/1' }[what]); m.clear();
  for (const run of [beginWorldFloorQuality, advanceWorldFloorQuality, loadWorldQuality, requireWorldFloorQuality]) {
    await expect(run(m.pages, 1)).rejects.toThrow();
  }
  expect(m.writes).toEqual([]);
});

it.each(['space', 'ports', 'join', 'connection', 'passage'])('missing established %s is never generated', async what => {
  const m = qualityFixture(781, 25, 'passage'); await beginWorldFloorQuality(m.pages, 1);
  const suffix = { space: 'space/socket-23:room', ports: 'ports/socket-23:room', join: 'join/socket-23',
    connection: 'connection/socket-23:exit', passage: 'space/socket-23:passage' }[what];
  m.rows.delete(`dungeon/1/${suffix}`); m.clear();
  await expect(advanceWorldFloorQuality(m.pages, 1, 1)).rejects.toThrow('quality binding');
  expect(m.writes).toEqual([]);
});

it.each(['cycle', 'self-loop', 'foreign child', 'reciprocal port', 'direction', 'endpoint', 'distance', 'seed', 'duplicate port', 'passage port', 'pending'])
('rejects corrupt %s without publishing a weaker quality proof', async damage => {
  const m = qualityFixture(781, 25, 'passage'); await beginWorldFloorQuality(m.pages, 1);
  const join = m.value('dungeon/1/join/socket-23').join, source = join.fromRoomId;
  switch (damage) {
    case 'cycle': join.fromRoomId = 'socket-23:room'; break;
    case 'self-loop': join.toRoomId = source; break;
    case 'foreign child': join.toRoomId = 'socket-999:room'; break;
    case 'reciprocal port': m.value(`dungeon/1/ports/${source}`).connections = []; break;
    case 'direction': join.direction = 'northwest'; break;
    case 'endpoint': m.value('dungeon/1/connection/socket-23:exit').connection.to.row++; break;
    case 'distance': m.value('dungeon/1/space/socket-23:room').distance = 0; break;
    case 'seed': m.value('dungeon/1/space/socket-23:room').spec.seed++; break;
    case 'duplicate port': m.value('dungeon/1/ports/socket-23:room').connections.push('socket-23:exit'); break;
    case 'passage port': m.value('dungeon/1/ports/socket-23:passage').connections.pop(); break;
    case 'pending': m.value('dungeon/1/ports/socket-23:room').pending.push('socket-24'); break;
  }
  m.clear(); await expect(advanceWorldFloorQuality(m.pages, 1, 1)).rejects.toThrow(); expect(m.writes).toEqual([]);
});

it.each(['running', 'qualified'])('pins the exact floor generation record in %s state', async phase => {
  const m = qualityFixture();
  if (phase === 'qualified') await finishQuality(m); else await beginWorldFloorQuality(m.pages, 1);
  m.put('dungeon/1', m.value('dungeon/1')); m.clear();
  for (const run of [beginWorldFloorQuality, advanceWorldFloorQuality, loadWorldQuality, requireWorldFloorQuality]) {
    await expect(run(m.pages, 1)).rejects.toThrow('binding');
  }
  expect(m.writes).toEqual([]);
});

it('rejects a child re-versioned between bounded batches', async () => {
  const m = qualityFixture(781, 3); await beginWorldFloorQuality(m.pages, 1); await advanceWorldFloorQuality(m.pages, 1, 2);
  m.put('dungeon/1/ports/socket-0:room', m.value('dungeon/1/ports/socket-0:room')); m.clear();
  await expect(advanceWorldFloorQuality(m.pages, 1)).rejects.toThrow('quality binding');
  expect(m.writes).toEqual([]);
});

it.each(['cursor', 'binding', 'verdict', 'manifest', 'metrics', 'last node'])('rejects corrupt progress %s', async damage => {
  const m = qualityFixture(); await beginWorldFloorQuality(m.pages, 1); await advanceWorldFloorQuality(m.pages, 1);
  const state = m.value('dungeon/1/quality/progress');
  switch (damage) {
    case 'cursor': state.nextRoom--; break;
    case 'binding': state.binding.roomCount++; break;
    case 'verdict': state.status = 'qualified'; break;
    case 'manifest': state.rooms = ['entry']; break;
    case 'metrics': state.metrics = { rooms: 25 }; break;
    case 'last node': state.lastNodeId = 'foreign'; break;
  }
  m.clear(); await expect(beginWorldFloorQuality(m.pages, 1)).rejects.toThrow();
  await expect(advanceWorldFloorQuality(m.pages, 1)).rejects.toThrow(); expect(m.writes).toEqual([]);
});

it('refuses partial generation and missing root proof at terminal state', async () => {
  const m = qualityFixture(), floor = m.value('dungeon/1');
  floor.generation.rooms--; floor.generation.revision--; floor.generation.pendingCount = 1; floor.nextPending--; floor.exit = null;
  await expect(beginWorldFloorQuality(m.pages, 1)).rejects.toThrow('completed generation'); expect(m.writes).toEqual([]);
  const done = qualityFixture(); await finishQuality(done); done.rows.delete('dungeon/1/quality/node/0');
  await expect(requireWorldFloorQuality(done.pages, 1)).rejects.toThrow('established quality node');
});
