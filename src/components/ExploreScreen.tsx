import { useEffect, useState } from 'react';
import { Crosshair, ZoomIn, ZoomOut } from 'lucide-react';
import type { Direction, GameState, GridPosition } from '../domain/types';
import { AutoThrottleControl } from './AutoThrottleControl';
import { Controls } from './Controls';
import type { MazeRenderMode } from './maze/drawMaze';
import { DEFAULT_MAZE_CAMERA, zoomMazeCamera, type MazeCameraState } from './maze/mazeCamera';
import { MazeCanvas } from './MazeCanvas';
import { createMazeViewModel } from '../viewModels/mazeViewModel';

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
  onNewGame: () => void;
  onRandomBattlesChange: (enabled: boolean) => void;
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
}: ExploreScreenProps) {
  const [mazeMode, setMazeMode] = useState<MazeRenderMode>('camera');
  const [camera, setCamera] = useState<MazeCameraState>(DEFAULT_MAZE_CAMERA);
  const isOverview = mazeMode === 'overview';
  const mazeView = createMazeViewModel(game, chests);
  const zoomLabel = `${Math.round(camera.zoom * 100)}%`;

  useEffect(() => {
    setCamera((current) => ({ ...current, mode: 'follow', origin: undefined }));
  }, [game.dungeonLevel, game.maze.rows, game.maze.columns]);

  return (
    <main className="game-screen explore-screen">
      <div className="screen-bar">
        <div>
          <h1>Maze Battle</h1>
          <span className="screen-status">
            Dungeon {game.dungeonLevel} - {status} - {game.maze.active.row + 1}, {game.maze.active.column + 1}
          </span>
        </div>
        <nav aria-label="Explore actions">
          <label className="compact-toggle">
            <input type="checkbox" checked={game.randomBattles} onChange={(event) => onRandomBattlesChange(event.currentTarget.checked)} />
            <span>Encounters</span>
          </label>
          <button className={autoActive ? 'is-active' : ''} type="button" onClick={onAutoToggle}>
            Auto
          </button>
          <button className={wavesActive ? 'is-active' : ''} type="button" onClick={onWavesToggle}>
            Waves
          </button>
          <AutoThrottleControl value={autoThrottleMs} onChange={onAutoThrottleChange} />
          <button type="button" onClick={onTown}>
            Portal
          </button>
          <button className={isOverview ? 'is-active' : ''} type="button" aria-pressed={isOverview} onClick={() => setMazeMode(isOverview ? 'camera' : 'overview')}>
            Map
          </button>
          <button type="button" onClick={onCharacters}>
            Party
          </button>
          <button type="button" onClick={onSaves}>
            Saves
          </button>
          <button type="button" onClick={onNewGame}>
            New
          </button>
        </nav>
      </div>
      <section className={`maze-stage ${isOverview ? 'is-overview' : ''}`}>
        <MazeCanvas
          maze={mazeView.maze}
          chests={mazeView.chests}
          facing={mazeView.facing}
          visibility={mazeView.visibility}
          camera={camera}
          mode={mazeMode}
          onCameraChange={setCamera}
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
      <Controls onMove={onMove} />
    </main>
  );
}
