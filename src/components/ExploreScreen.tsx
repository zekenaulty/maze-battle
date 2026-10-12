import { useEffect, useState } from 'react';
import { Activity, Bot as Robot, Crosshair, Map, Save, Settings, Square, Users, ZoomIn, ZoomOut } from 'lucide-react';
import type { Direction, GameState, GridPosition } from '../domain/types';
import { AutoThrottleControl } from './AutoThrottleControl';
import { Controls } from './Controls';
import type { MazeRenderMode } from './maze/drawMaze';
import { DEFAULT_MAZE_CAMERA, zoomMazeCamera, type MazeCameraState } from './maze/mazeCamera';
import { MazeCanvas } from './MazeCanvas';
import { createMazeViewModel } from '../viewModels/mazeViewModel';
import { Dialog } from './Dialog';
import { ConfirmActionDialog } from './screens/ConfirmActionDialog';
import { AutoStatus } from './screens/AutoStatus';
import './screens/screens.css';
import { chestAtActivePosition } from '../domain/items/chests';
import { useExploreKeys } from '../hooks/useExploreKeys';

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
  onAgenticPlay?: () => void;
  onStopAgenticPlay?: () => void;
  onTileClick?: (position: GridPosition) => void;
  onStopWalking?: () => void;
  onOpenChest?: (id: string) => void;
  navigationMessage?: string;
  controlsDisabled?: boolean;
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
  onAgenticPlay, onStopAgenticPlay,
  onTileClick, onStopWalking, onOpenChest, navigationMessage, controlsDisabled = false,
}: ExploreScreenProps) {
  const [mazeMode, setMazeMode] = useState<MazeRenderMode>('camera');
  const [camera, setCamera] = useState<MazeCameraState>(DEFAULT_MAZE_CAMERA);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const portalCount = portalScrollCount ?? game.inventory.items.reduce((count, item) =>
    item.consumableEffect === 'townPortal' ? count + Math.max(0, Math.floor(item.quantity ?? 1)) : count, 0);
  const isOverview = mazeMode === 'overview';
  const mazeView = createMazeViewModel(game, chests);
  const zoomLabel = `${Math.round(camera.zoom * 100)}%`;
  const chest = chestAtActivePosition(game);
  const blocked = controlsDisabled || settingsOpen || confirmNew;
  const toggleMap = () => { onStopWalking?.(); setMazeMode(isOverview ? 'camera' : 'overview'); };
  const interact = () => { onStopWalking?.(); if (!blocked && chest) onOpenChest?.(chest.id); };
  useExploreKeys(blocked, { interact, map: toggleMap, inventory: onCharacters,
    portal: () => { if (portalCount > 0) onTown(); }, stop: () => onStopWalking?.() });

  useEffect(() => {
    setCamera((current) => ({ ...current, mode: 'follow', origin: undefined }));
  }, [game.dungeonLevel, game.maze.rows, game.maze.columns]);

  return (
    <main className={`game-screen explore-screen refined-screen ${onDiagnostics ? 'has-diagnostics' : ''} ${onAgenticPlay ? 'has-agentic' : ''}`}>
      <div className="screen-bar">
        <div>
          <h1>Maze Battle</h1>
          <span className="screen-status">
            Dungeon {game.dungeonLevel} - {status} - {game.maze.active.row + 1}, {game.maze.active.column + 1}
          </span>
        </div>
        <nav aria-label="Explore actions" onClickCapture={event => {
          if (!(event.target instanceof Element && event.target.closest('[data-agentic-control]'))) onStopWalking?.();
        }}>
          <button className={autoActive ? 'is-active' : ''} type="button" aria-pressed={autoActive} onClick={onAutoToggle}>
            {autoActive ? 'Stop Auto' : 'Auto'}
          </button>
          <button className={wavesActive ? 'is-active' : ''} type="button" aria-pressed={wavesActive} onClick={onWavesToggle}>
            {wavesActive ? 'Stop Waves' : 'Waves'}
          </button>
          {onAgenticPlay && <button className="screen-icon" data-agentic-control type="button" title="Agentic play" aria-label="Agentic play" onClick={onAgenticPlay}>
            <Robot size={18} aria-hidden="true" />
          </button>}
          {onStopAgenticPlay && <button className="agentic-stop" data-agentic-control type="button" title="Stop Agentic play" aria-label="Stop Agentic play" onClick={onStopAgenticPlay}>
            <Square size={14} aria-hidden="true" />Stop
          </button>}
          <button type="button" onClick={onTown} disabled={portalCount < 1} aria-keyshortcuts="T" title={portalCount > 0 ? 'Use one town portal scroll (T)' : 'No portal scrolls. Floor-one entrance stairs are free.'}>
            Portal ({portalCount})
          </button>
          <button className={`screen-icon ${isOverview ? 'is-active' : ''}`} type="button" title="Map overview (M)" aria-label="Map" aria-keyshortcuts="M" aria-pressed={isOverview} onClick={toggleMap}>
            <Map size={18} aria-hidden="true" />
          </button>
          <button className="screen-icon" type="button" title="Party and inventory (I)" aria-label="Party" aria-keyshortcuts="I" onClick={onCharacters}>
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
        <MazeCanvas
          maze={mazeView.maze}
          chests={mazeView.chests}
          facing={mazeView.facing}
          visibility={mazeView.visibility}
          camera={camera}
          mode={mazeMode}
          onCameraChange={setCamera}
          onTileClick={blocked ? undefined : onTileClick}
        />
        {mazeMode === 'camera' && (
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
      <div className="explore-interaction">
        <button type="button" onClick={interact} disabled={blocked || !chest || !onOpenChest} title="Open chest (E)" aria-keyshortcuts="E">Open chest</button>
        <span aria-live="polite">{navigationMessage}</span>
      </div>
      <Controls onMove={onMove} disabled={blocked} />
      {settingsOpen && <Dialog title="Expedition settings" onClose={() => setSettingsOpen(false)}>
        <div className="screen-settings">
          <label className="compact-toggle">
            <input type="checkbox" checked={game.randomBattles} onChange={(event) => onRandomBattlesChange(event.currentTarget.checked)} />
            <span>Encounters</span>
          </label>
          <AutoThrottleControl value={autoThrottleMs} onChange={onAutoThrottleChange} />
          <button type="button" onClick={() => { setSettingsOpen(false); setConfirmNew(true); }}>New game</button>
        </div>
      </Dialog>}
      {confirmNew && <ConfirmActionDialog title="Start a new game?" message="This replaces the current expedition and autosave. Manual saves are kept." confirmLabel="Start new game" onConfirm={onNewGame} onClose={() => setConfirmNew(false)} />}
    </main>
  );
}
