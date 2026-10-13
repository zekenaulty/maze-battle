import { createRoot } from 'react-dom/client';
import { ExploreScreen } from '../../src/components/ExploreScreen';
import { drawMaze } from '../../src/components/maze/drawMaze';
import { mazeGridGeometry } from '../../src/components/maze/mazeHitTest';
import { createCanonicalMazeView, currentVisibleCell } from '../../src/viewModels/canonicalPerceivedMaze';
import { readCanonicalRegion, readKnowledgeRegion, type KnowledgeRegionScope } from '../../src/persistence/canonical/knowledge/region';
import { loadObservation } from '../../src/persistence/canonical/knowledge/evidence';
import { worldBlockKey } from '../../src/persistence/canonical/knowledge/worldIndex';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { gameCheckpoint, rosterContext } from '../../src/persistence/canonical/game/checkpoint';
import { loadRoster } from '../../src/persistence/canonical/roster/projection';
import type { CanonicalSnapshot } from '../../src/persistence/canonical/types';
import type { GameView } from '../../src/services/game/GameView';
import type { GridPosition } from '../../src/domain/types';
import * as knowledge from './canonical-knowledge-fixture';
import * as content from './canonical-content-fixture';
import * as roster from './canonical-roster-fixture';
import { floorTranscript, loadWorldRoom } from './canonical-world-fixture';
import '../../src/styles.css';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5220') throw Error('Isolated canonical map fixture only');
const root = createRoot(document.getElementById('root')!), clicks: GridPosition[] = [], noop = () => {};
let game: GameView;
async function show(snapshot?: CanonicalSnapshot) {
  game = (await readCanonical(async (p, s): Promise<GameView> => {
    const checkpoint = gameCheckpoint(s.checkpoint), roster = await loadRoster(p, rosterContext(checkpoint));
    const observation = checkpoint.knowledge ? await loadObservation(p, { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id }) : null;
    return { ...roster.state, id: s.gameId, mode: checkpoint.mode, checkpoint, snapshot: s, observation, quests: [], contracts: [] };
  }, { snapshot })).value;
  root.render(<ExploreScreen game={game} status="Ready" onMove={direction => { void knowledge.act({ kind: 'move', direction, triggerStairs: false }).then(() => show()); }}
    autoActive={false} wavesActive={false} autoThrottleMs={500} onAutoToggle={noop} onWavesToggle={noop} onAutoThrottleChange={noop}
    onTown={noop} onCharacters={noop} onSaves={noop} onNewGame={noop} onRandomBattlesChange={noop} onTileClick={at => clicks.push(at)}
    onOpenChest={id => { void content.act({ kind: 'open-chest', chestId: id }).then(() => show()); }} />);
  return { snapshot: game.snapshot, actor: currentVisibleCell(game)?.world, observation: game.observation };
}
async function seedNegative() {
  await knowledge.seed(); const transcript = (await floorTranscript()).value;
  const space = transcript.spaces.find(s => s.kind === 'room' && (s.origin.row < -4 || s.origin.column < -4));
  if (!space) throw Error('Fixture must contain negative room');
  const room = (await readCanonical(p => loadWorldRoom(p, 1, space.id))).value;
  const local = room.geometry.cells.find(c => space.origin.row + c.row < 0 || space.origin.column + c.column < 0)!;
  await content.place({ level: 1, cell: { spaceId: space.id, row: local.row, column: local.column } });
  await knowledge.act({ kind: 'look' }); return show();
}
async function picture(snapshot: CanonicalSnapshot, scope: KnowledgeRegionScope) {
  const result = await readCanonicalRegion(snapshot, scope), view = createCanonicalMazeView(result.value, gameCheckpoint(snapshot.checkpoint).facing);
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
  const context = canvas.getContext('2d')!;
  drawMaze(context, { width: 640, height: 480 }, view.maze, view.chests, view.facing, 0,
    { mode: 'camera', visibility: view.visibility, viewport: view.viewport, artOrigin: view.origin });
  return { region: result.value, pixels: canvas.toDataURL(), stats: result.stats };
}
async function clickPoint() {
  const canvas = document.querySelector('canvas')!, bounds = canvas.getBoundingClientRect();
  const scope = { floor: game.checkpoint.position.level, row: Number(canvas.dataset.rowStart), column: Number(canvas.dataset.columnStart),
    rows: Number(canvas.dataset.rows), columns: Number(canvas.dataset.columns) };
  const view = createCanonicalMazeView((await readCanonicalRegion(game.snapshot, scope)).value, game.checkpoint.facing);
  const world = currentVisibleCell(game)!.world, mode = document.querySelector('.is-overview') ? 'overview' : 'camera';
  const grid = mazeGridGeometry(view.maze, { width: Math.floor(bounds.width), height: Math.floor(bounds.height) }, { mode: 'follow', zoom: 1 }, mode, view.viewport);
  return { world, x: bounds.left + grid.x + (world.column - scope.column + 0.5) * grid.cellSize,
    y: bounds.top + grid.y + (world.row - scope.row + 0.5) * grid.cellSize };
}
const api = { seedNegative, show, picture, clickPoint, clicks, knowledge, content, roster, gameCheckpoint, worldBlockKey,
  readCanonical, readCanonicalHead, readCanonicalRegion, readKnowledgeRegion };
declare global { interface Window { canonicalMap: typeof api } }
window.canonicalMap = api;
