import type { Direction, GameState, GridPosition } from '../domain/types';
import { AutoThrottleControl } from './AutoThrottleControl';
import { Controls } from './Controls';
import { MazeCanvas } from './MazeCanvas';

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
      <section className="maze-stage">
        <MazeCanvas maze={game.maze} chests={chests} facing={game.facing} />
      </section>
      <Controls onMove={onMove} />
    </main>
  );
}
