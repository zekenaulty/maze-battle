import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Check, DoorOpen, Map, Pause, Play, RotateCcw } from 'lucide-react';
import type { Direction } from '../../domain/types';
import { sameAddress } from '../../domain/expedition/address';
import { useStreamExpedition } from '../../hooks/useStreamExpedition';
import { STREAM_CELL_BUDGET } from '../../services/expedition/streamRuntime';
import { streamLevelFromSearch } from '../../services/expedition/streamConfiguration';
import { streamExpeditionViewModel } from '../../viewModels/streamExpeditionViewModel';
import { ExpeditionCanvas } from './ExpeditionCanvas';
import { StreamMapPanel } from './StreamMapPanel';
import './expedition.css';

const KEYS: Record<string, Direction> = { w: 'north', a: 'west', s: 'south', d: 'east', ArrowUp: 'north', ArrowLeft: 'west', ArrowDown: 'south', ArrowRight: 'east' };
const MOVES = [{ direction: 'north', Icon: ArrowUp }, { direction: 'west', Icon: ArrowLeft }, { direction: 'south', Icon: ArrowDown }, { direction: 'east', Icon: ArrowRight }] as const;

export default function StreamExpeditionApp() {
  const level = streamLevelFromSearch(location.search);
  const session = useStreamExpedition(level);
  const [mapOpen, setMapOpen] = useState(false);
  const { view, runtime, dispatch } = session;
  const move = (direction: Direction) => {
    const snapshot = runtime?.snapshot;
    const pending = snapshot && Object.values(snapshot.room.knowledge!.frontiers)
      .find(port => sameAddress(port, snapshot.checkpoint.position) && port.direction === direction);
    void dispatch(pending ? { type: 'prepare', frontierId: pending.id } : { type: 'move', direction }, true);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (mapOpen) { if (event.key === 'Escape') setMapOpen(false); return; }
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const direction = KEYS[event.key];
      if (!direction) return;
      event.preventDefault(); move(direction);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!view || !runtime) return <main className="expedition-loading"><p role="status">{session.error ?? session.message}</p><a href="/">Main game</a></main>;
  const { checkpoint, room } = view;
  const projection = streamExpeditionViewModel(view);
  const geometry = runtime.cache.get(room.space.spec);
  const stats = runtime.cache.stats();
  const planning = runtime.planner.diagnostics;
  return <main className="expedition-screen stream-screen" data-revision={checkpoint.revision} data-topology-revision={checkpoint.topologyRevision}
    data-phase={checkpoint.phase} data-moves={checkpoint.moves} data-visited-spaces={checkpoint.visitedSpaces}
    data-chests={checkpoint.collectedChests} data-resident-cells={stats.residentCells} data-evictions={stats.evictions}
    data-planner-pages={planning.cache.pages} data-planner-cells={planning.cache.cells} data-reused-steps={planning.work.reusedSteps}>
    <header>
      <div><h1>Streamed Expedition</h1><span>Floor {level} - {room.space.spec.name} - {checkpoint.position.row + 1}, {checkpoint.position.column + 1}</span></div>
      <nav aria-label="Expedition controls">
        <button type="button" onClick={session.toggle} disabled={mapOpen || !!session.error || checkpoint.phase === 'complete'} aria-pressed={session.playing}>
          {session.playing ? <Pause size={17} /> : <Play size={17} />}{session.playing ? 'Stop Auto' : 'Explore'}</button>
        <button type="button" onClick={() => void dispatch({ type: 'collect' }, true)} disabled={mapOpen || !projection.chestHere || !!session.error} title="Collect chest" aria-label="Collect chest"><Box size={18} /></button>
        <button type="button" onClick={() => projection.frontier && void dispatch({ type: 'prepare', frontierId: projection.frontier.id }, true)} disabled={mapOpen || !projection.frontier || !!session.error} title="Prepare doorway" aria-label="Prepare doorway"><DoorOpen size={18} /></button>
        <button type="button" onClick={() => void dispatch({ type: 'finish' }, true)} disabled={mapOpen || checkpoint.phase === 'complete' || !!session.error} title="Finish expedition" aria-label="Finish expedition"><Check size={18} /></button>
        <button type="button" onClick={() => { if (!mapOpen) session.stop(); setMapOpen(!mapOpen); }} aria-pressed={mapOpen}
          title={mapOpen ? 'Return to dungeon' : 'Discovered map'} aria-label={mapOpen ? 'Return to dungeon' : 'Discovered map'}><Map size={18} /></button>
        <a href="/" title="Main game" aria-label="Main game"><ArrowLeft size={20} /></a>
      </nav>
    </header>
    <div className="expedition-strip">
      <span>Mapped {checkpoint.visitedSpaces} - Cleared {checkpoint.clearedSpaces} - Loot {checkpoint.collectedChests}</span>
      <label>Pace <input aria-label="Exploration pace" type="range" min={20} max={800} step={20} value={session.delay} onChange={event => session.setDelay(Number(event.target.value))} /><output>{session.delay}ms</output></label>
    </div>
    <section className={`expedition-scene${mapOpen ? ' is-map' : ''}`}>{mapOpen
      ? <StreamMapPanel slot={runtime.slot} current={checkpoint.position} revision={checkpoint.revision} />
      : <ExpeditionCanvas checkpoint={projection.canvasCheckpoint} spec={projection.spec} geometry={geometry} facing={session.facing} frontiers={projection.frontiers} minimumViewCells={9} />}</section>
    <footer>
      <div role="status">{session.error ?? session.message}</div>
      <span className="expedition-metrics">Loaded {stats.residentCells}/{STREAM_CELL_BUDGET} - Evictions {stats.evictions} - Checkpoint {checkpoint.revision}</span>
      {session.error && <button type="button" onClick={() => location.reload()}><RotateCcw size={16} />Reload</button>}
      {!mapOpen && <div className="expedition-movement" aria-label="Movement">
        {MOVES.map(({ direction, Icon }) => <button type="button" key={direction} aria-label={`Move ${direction}`} onClick={() => move(direction)} disabled={!!session.error || checkpoint.phase === 'complete'}><Icon size={22} /></button>)}
      </div>}
    </footer>
  </main>;
}
