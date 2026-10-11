import { createRoot } from 'react-dom/client';
import { App } from '../../src/App';
import { createNewGameState } from '../../src/domain/gameFactory';
import { seededRng } from '../../src/domain/automation/autopilotTestFixtures';
import { getDatabase, saveGame } from '../../src/persistence/saveRepository';
import type { Direction, MazeState } from '../../src/domain/types';
import '../../src/styles.css';

async function snapshot() {
  const db = await getDatabase(), tx = db.transaction(['saves', 'meta', 'telemetry'], 'readonly');
  const saves = await tx.objectStore('saves').getAll(), meta = await tx.objectStore('meta').getAll(), telemetry = await tx.objectStore('telemetry').getAll();
  await tx.done;
  return { saves, meta, telemetry };
}
declare global { interface Window { clickRpg: { snapshot: typeof snapshot } } }

async function start() {
  if (!import.meta.env.DEV || location.hostname !== '127.0.0.1' || location.port !== '5203') throw new Error('Isolated fixture origin required');
  const marker = 'click-navigation-fixture-v1';
  if (!(await snapshot()).saves.length) {
    if (sessionStorage.getItem(marker)) throw new Error('Fixture database disappeared');
    const maze: MazeState = {
      rows: 7, columns: 17, start: { row: 3, column: 1 }, end: { row: 3, column: 15 }, active: { row: 3, column: 2 },
      visited: [{ row: 3, column: 2 }], visibility: { radius: 7, explored: [] },
      cells: Array.from({ length: 119 }, (_, index) => {
        const row = Math.floor(index / 17), column = index % 17, links: Direction[] = [];
        if (row === 3 && column > 1 && column <= 15) links.push('west');
        if (row === 3 && column >= 1 && column < 15) links.push('east');
        return { row, column, links };
      }),
    };
    const random = Math.random; Math.random = seededRng(5203);
    const game = createNewGameState({ id: marker, randomBattles: false, autoThrottleMs: 400, maze,
      chests: [{ id: 'click-chest', level: 1, position: { row: 3, column: 5 }, opened: false }] });
    Math.random = random;
    await saveGame('auto', marker, 'auto', { ...game, party: game.party.map(a => ({ ...a, autoBattle: false })) });
    sessionStorage.setItem(marker, 'seeded');
  } else if (!sessionStorage.getItem(marker)) throw new Error('Refusing non-fixture database');
  window.clickRpg = { snapshot };
  createRoot(document.getElementById('root')!).render(<App />);
}
void start();
