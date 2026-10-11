import { createRoot } from 'react-dom/client';
import { App } from '../../src/App';
import { createNewGameState } from '../../src/domain/gameFactory';
import { seededRng } from '../../src/domain/automation/autopilotTestFixtures';
import { generateStructuredMaze } from '../../src/domain/maze/structuredGenerate';
import { getDatabase, saveGame } from '../../src/persistence/saveRepository';
import '../../src/styles.css';

export interface ResizePaint {
  frame: number;
  width: number;
  height: number;
  player?: { x: number; y: number; mode: 'camera' | 'overview' };
}

async function snapshot() {
  const db = await getDatabase();
  const tx = db.transaction(['saves', 'meta'], 'readonly');
  const saves = await tx.objectStore('saves').getAll();
  const meta = await tx.objectStore('meta').getAll();
  await tx.done;
  return { saves, meta };
}

declare global {
  interface Window {
    resizeQualification: { session: string; paint: ResizePaint; snapshot: typeof snapshot };
  }
}

// Observe actual drawing, not React internals. All original canvas calls still execute.
function observePaint() {
  const prototype = CanvasRenderingContext2D.prototype;
  const clear = prototype.clearRect, drawImage = prototype.drawImage, arc = prototype.arc;
  const isMap = (context: CanvasRenderingContext2D) => context.canvas.getAttribute('aria-label') === 'Dungeon map';
  prototype.clearRect = function (x, y, width, height) {
    if (isMap(this)) {
      window.resizeQualification.paint = { frame: window.resizeQualification.paint.frame + 1, width, height };
    }
    clear.call(this, x, y, width, height);
  };
  prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof drawImage>) {
    if (isMap(this) && args[0] instanceof HTMLImageElement && args[0].src.includes('/knight-gpt/')) {
      const transform = this.getTransform();
      window.resizeQualification.paint.player = {
        x: transform.e / devicePixelRatio, y: transform.f / devicePixelRatio, mode: 'camera',
      };
    }
    drawImage.apply(this, args);
  } as typeof drawImage;
  prototype.arc = function (...args) {
    if (isMap(this) && this.fillStyle === '#f4f7ff') {
      window.resizeQualification.paint.player = { x: args[0], y: args[1], mode: 'overview' };
    }
    arc.apply(this, args);
  };
}

async function start() {
  // Refuse to seed an existing store, even though Playwright owns a fresh context.
  if ((await snapshot()).saves.length) throw new Error('Resize fixture requires an empty disposable database');
  const maze = generateStructuredMaze(41, 45, seededRng(20261011));
  const candidates = maze.cells.filter(cell => cell.links.length === 4);
  candidates.sort((a, b) => Math.hypot(a.row - 20, a.column - 22) - Math.hypot(b.row - 20, b.column - 22));
  if (!candidates[0]) throw new Error('Resize fixture needs a walkable room interior');
  maze.active = { row: candidates[0].row, column: candidates[0].column };
  maze.visited = [maze.active];
  const game = createNewGameState({ id: 'd1-resize-session', maze, mode: 'manual', randomBattles: false, chests: [] });
  await saveGame('auto', 'Resize qualification', 'auto', game);
  window.resizeQualification = { session: crypto.randomUUID(), paint: { frame: 0, width: 0, height: 0 }, snapshot };
  observePaint();
  createRoot(document.getElementById('root')!).render(<App />);
}

void start();
