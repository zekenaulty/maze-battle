import { useEffect, useState } from 'react';
import { Activity, Crosshair, Map, Save, Settings, Users, ZoomIn, ZoomOut } from 'lucide-react';
import type { Direction, GameState, GridPosition } from '../domain/types';
import { AutoThrottleControl } from './AutoThrottleControl';
import { Controls } from './Controls';
import type { MazeRenderMode } from './maze/drawMaze';
import { DEFAULT_MAZE_CAMERA, zoomMazeCamera, type MazeCameraState } from './maze/mazeCamera';
import { MazeCanvas } from './MazeCanvas';
import { Maze3DProjection } from './Maze3DProjection';
import { createMazeViewModel } from '../viewModels/mazeViewModel';
import { Dialog } from './Dialog';
import { ConfirmActionDialog } from './screens/ConfirmActionDialog';
import { AutoStatus } from './screens/AutoStatus';
import './screens/screens.css';

interface ExploreScreenProps {
  game: GameState;
  status: string;
  onMove: (direction: Direction) => void;
  chests: GridPosition[];
  autoActive: boolean;
  wavesActive: boolean;
  autoThrottleMs: number;
  onAutoToggle: () => void;
  onWavesToggle: () => void;
  onAutoThrottleChange: (value: number) => void;
  onTown: () => void;
  onCharacters: () => void;
  onSaves: () => void;
  onNewGame: () => void | Promise<void>;
  onRandomBattlesChange: (enabled: boolean) => void;
  portalScrollCount?: number;
  onDiagnostics?: () => void;
}

export function ExploreScreen({
  game,
  status,
  onMove,
  chests,
  autoActive,
  wavesActive,
  autoThrottleMs,
  onAutoToggle,
  onWavesToggle,
  onAutoThrottleChange,
  onTown,
  onCharacters,
  onSaves,
  onNewGame,
  onRandomBattlesChange,
  portalScrollCount,
  onDiagnostics,
}: ExploreScreenProps) {
  const [mazeMode, setMazeMode] = useState<MazeRenderMode>('camera');
  const [view3D, setView3D] = useState(false);
  const [camera, setCamera] = useState<MazeCameraState>(DEFAULT_MAZE_CAMERA);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const portalCount = portalScrollCount ?? game.inventory.items.reduce((count, item) =>
    item.consumableEffect === 'townPortal' ? count + Math.max(0, Math.floor(item.quantity ?? 1)) : count, 0);
  const isOverview = !view3D && mazeMode === 'overview';
  const mazeView = createMazeViewModel(game, chests);
  const zoomLabel = `${Math.round(camera.zoom * 100)}%`;

  useEffect(() => {
    setCamera((current) => ({ ...current, mode: 'follow', origin: undefined }));
  }, [game.dungeonLevel, game.maze.rows, game.maze.columns]);

  return (
    <main className={`game-screen explore-screen refined-screen ${onDiagnostics ? 'has-diagnostics' : ''}`}>
      <div className="screen-bar">
        <div>
          <h1>Maze Battle</h1>
          <span className="screen-status">
            Dungeon {game.dungeonLevel} - {status} - {game.maze.active.row + 1}, {game.maze.active.column + 1}
          </span>
        </div>
        <nav aria-label="Explore actions">
          <button className={autoActive ? 'is-active' : ''} type="button" aria-pressed={autoActive} onClick={onAutoToggle}>
            {autoActive ? 'Stop Auto' : 'Auto'}
          </button>
          <button className={wavesActive ? 'is-active' : ''} type="button" aria-pressed={wavesActive} onClick={onWavesToggle}>
            {wavesActive ? 'Stop Waves' : 'Waves'}
          </button>
          <button type="button" onClick={onTown} disabled={portalCount < 1} title={portalCount > 0 ? 'Use one town portal scroll' : 'No portal scrolls. Floor-one entrance stairs are free.'}>
            Portal ({portalCount})
          </button>
          <button className={`screen-icon ${isOverview ? 'is-active' : ''}`} type="button" title="Map overview" aria-label="Map" aria-pressed={isOverview} onClick={() => { setView3D(false); setMazeMode(isOverview ? 'camera' : 'overview'); }}>
            <Map size={18} aria-hidden="true" />
          </button>
          <button className="screen-icon" type="button" title="Party" aria-label="Party" onClick={onCharacters}>
            <Users size={18} aria-hidden="true" />
          </button>
          <button className="screen-icon" type="button" title="Saves" aria-label="Saves" onClick={onSaves}>
            <Save size={18} aria-hidden="true" />
          </button>
          {onDiagnostics && <button className="screen-icon" type="button" title="Diagnostics" aria-label="Diagnostics" onClick={onDiagnostics}><Activity size={18} aria-hidden="true" /></button>}
          <button className="screen-icon" type="button" title="Expedition settings" aria-label="Expedition settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} aria-hidden="true" />
          </button>
        </nav>
      </div>
      <AutoStatus game={game} active={autoActive} />
      <section className={`maze-stage ${isOverview ? 'is-overview' : ''}`}>
        {view3D ? (
          <Maze3DProjection maze={mazeView.maze} facing={mazeView.facing} textureId={game.mazeTexture} />
        ) : (
        <MazeCanvas
          maze={mazeView.maze}
          chests={mazeView.chests}
          facing={mazeView.facing}
          visibility={mazeView.visibility}
          camera={camera}
          mode={mazeMode}
          onCameraChange={setCamera}
        />
        )}
        {!view3D && mazeMode === 'camera' && (
          <div className="camera-controls" aria-label="Camera controls">
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => setCamera((current) => zoomMazeCamera(current, -0.15))}>
              <ZoomOut aria-hidden="true" size={16} />
            </button>
            <span aria-label={`Camera zoom ${zoomLabel}`}>{zoomLabel}</span>
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => setCamera((current) => zoomMazeCamera(current, 0.15))}>
              <ZoomIn aria-hidden="true" size={16} />
            </button>
            <button type="button" aria-label="Recenter camera" title="Recenter camera" onClick={() => setCamera((current) => ({ ...current, mode: 'follow', origin: undefined }))}>
              <Crosshair aria-hidden="true" size={16} />
            </button>
          </div>
        )}
      </section>
      <Controls onMove={onMove} />
      {settingsOpen && <Dialog title="Expedition settings" onClose={() => setSettingsOpen(false)}>
        <div className="screen-settings">
          <label className="compact-toggle">
            <input type="checkbox" checked={game.randomBattles} onChange={(event) => onRandomBattlesChange(event.currentTarget.checked)} />
            <span>Encounters</span>
          </label>
          <AutoThrottleControl value={autoThrottleMs} onChange={onAutoThrottleChange} />
          <label className="compact-toggle">
            <input type="checkbox" checked={view3D} onChange={event => setView3D(event.currentTarget.checked)} />
            <span>Experimental 3D projection (visual only)</span>
          </label>
          <button type="button" onClick={() => { setSettingsOpen(false); setConfirmNew(true); }}>New game</button>
        </div>
      </Dialog>}
      {confirmNew && <ConfirmActionDialog title="Start a new game?" message="This replaces the current expedition and autosave. Manual saves are kept." confirmLabel="Start new game" onConfirm={onNewGame} onClose={() => setConfirmNew(false)} />}
    </main>
  );
}
