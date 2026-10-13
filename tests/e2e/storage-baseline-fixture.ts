import { createNewGameState } from '../../src/domain/gameFactory';
import { generateStructuredMaze } from '../../src/domain/maze/structuredGenerate';
import { seededRng } from '../../src/domain/automation/autopilotTestFixtures';
import { GameSession } from '../../src/services/game/GameSession';
import { getDatabase, saveGame } from '../../src/persistence/saveRepository';
import { moveManually } from '../../src/hooks/useGameLoop';
import { storageProbe } from './storage-probe';

async function run(depth: number) {
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > 512) throw new Error('Invalid fixture depth');
  const db = await getDatabase();
  if (await db.count('saves')) throw new Error('Refusing nonempty fixture storage');
  const maze = generateStructuredMaze(31, 33, seededRng(11));
  const cell = maze.cells.find(c => c.row > 0 && c.column > 0 && c.links.includes('east'))!;
  maze.active = { row: cell.row, column: cell.column };
  const floors = Array.from({ length: depth }, (_, i) => ({ level: i + 1, mazeMaxRooms: 32, monsterTags: ['vermin' as const], maze }));
  const game = createNewGameState({ id: `storage-depth-${depth}`, maze, floors, randomBattles: false });
  await saveGame('auto', 'Storage benchmark', 'auto', game);
  const session = new GameSession(() => {});
  try {
    await session.start();
    const stored = await db.get('saves', 'auto');
    const slotBytes = new TextEncoder().encode(JSON.stringify(stored)).byteLength;
    const beforeEstimate = await navigator.storage.estimate();
    const samples = [];
    for (let i = 0; i < 6; i++) {
      const probe = storageProbe(), started = performance.now();
      session.transition(state => moveManually(state, i % 2 ? 'west' : 'east', { triggerStairs: false }), { source: 'manual', action: 'move' });
      await session.flush();
      const elapsedMs = performance.now() - started;
      samples.push({ elapsedMs, ...probe.finish() });
      if (!session.view.controlled || session.view.status !== 'Saved') throw new Error(`Movement failed: ${session.view.status}`);
    }
    const refreshProbe = storageProbe(), started = performance.now();
    await session.refresh();
    const refresh = { elapsedMs: performance.now() - started, ...refreshProbe.finish() };
    const unmeteredMs: number[] = [];
    for (let i = 0; i < 6; i++) {
      const started = performance.now();
      session.transition(state => moveManually(state, i % 2 ? 'west' : 'east', { triggerStairs: false }), { source: 'manual', action: 'move' });
      await session.flush();
      unmeteredMs.push(performance.now() - started);
      if (!session.view.controlled || session.view.status !== 'Saved') throw new Error(`Movement failed: ${session.view.status}`);
    }
    const afterEstimate = await navigator.storage.estimate();
    return { depth, cellsPerFloor: maze.cells.length, slotBytes, samples, refresh, unmeteredMs,
      browserStorageEstimate: { before: beforeEstimate.usage, after: afterEstimate.usage },
      note: 'Synthetic retained floors, identical active floor. Native IDB payload JSON sizes, not physical disk bytes. Timings include metering overhead, separately reported. Storage estimate is origin-wide and approximate.' };
  } finally { session.stop(); }
}

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5208') throw new Error('Isolated storage fixture only');
declare global { interface Window { storageBaseline: { run: typeof run } } }
window.storageBaseline = { run };
