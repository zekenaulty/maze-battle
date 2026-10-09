import { useEffect } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Check, Pause, Play, RotateCcw } from 'lucide-react';
import type { Direction } from '../../domain/types';
import { useExpedition, RESIDENT_CELL_BUDGET } from '../../hooks/useExpedition';
import { ExpeditionCanvas } from './ExpeditionCanvas';
import './expedition.css';

const KEYS: Record<string, Direction> = { w: 'north', a: 'west', s: 'south', d: 'east', ArrowUp: 'north', ArrowLeft: 'west', ArrowDown: 'south', ArrowRight: 'east' };
const MOVES = [{ direction: 'north', Icon: ArrowUp }, { direction: 'west', Icon: ArrowLeft }, { direction: 'south', Icon: ArrowDown }, { direction: 'east', Icon: ArrowRight }] as const;

export default function ExpeditionApp() {
  const session = useExpedition();
  const { view, runtime, dispatch } = session;
  const move = (direction: Direction) => { void dispatch({ type: 'move', direction }, true); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const direction = KEYS[event.key];
      if (!direction) return;
      event.preventDefault();
      void dispatch({ type: 'move', direction }, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);
  if (!view || !runtime) return <main className="expedition-loading"><p role="status">{session.error ?? session.message}</p><a href="/">Main game</a></main>;
  const { checkpoint, plan } = view;
  const spec = plan.spaces.find(space => space.id === checkpoint.position.spaceId)!;
  const geometry = runtime.cache.get(spec);
  const stats = runtime.cache.stats();
  const routing = runtime.planner.diagnostics.work;
  const knownSpaces = new Set(Object.values(checkpoint.knowledge.cells).map(cell => cell.spaceId)).size;
  const chestHere = Object.values(checkpoint.knowledge.chests).some(chest => !chest.opened && chest.spaceId === spec.id && chest.row === checkpoint.position.row && chest.column === checkpoint.position.column);
  return <main className="expedition-screen" data-revision={checkpoint.revision} data-phase={checkpoint.phase}
    data-moves={checkpoint.moves} data-resident-cells={stats.residentCells} data-evictions={stats.evictions}
    data-route-plans={routing.plans} data-reused-steps={routing.reusedSteps} data-map-audits={routing.fullAudits}>
    <header>
      <div><h1>Guild Expedition</h1><span>{spec.name} - {checkpoint.position.row + 1}, {checkpoint.position.column + 1}</span></div>
      <nav aria-label="Expedition controls">
        <button type="button" onClick={session.toggle} disabled={!!session.error || checkpoint.phase === 'complete'} aria-pressed={session.playing}>
          {session.playing ? <Pause size={17} /> : <Play size={17} />}{session.playing ? 'Stop Auto' : 'Explore'}
        </button>
        <button type="button" onClick={() => void dispatch({ type: 'collect' }, true)} disabled={!chestHere || !!session.error} title="Collect chest" aria-label="Collect chest"><Box size={18} /></button>
        <button type="button" onClick={() => void dispatch({ type: 'finish' }, true)} disabled={checkpoint.phase === 'complete' || !!session.error} title="Finish expedition" aria-label="Finish expedition"><Check size={18} /></button>
        <a href="/">Main game</a>
      </nav>
    </header>
    <div className="expedition-strip">
      <span>Mapped {knownSpaces} spaces - Caches {checkpoint.openedChestIds.length} - Moves {checkpoint.moves}</span>
      <label>Pace <input aria-label="Exploration pace" type="range" min={20} max={800} step={20} value={session.delay} onChange={event => session.setDelay(Number(event.target.value))} /><output>{session.delay}ms</output></label>
    </div>
    <section className="expedition-scene"><ExpeditionCanvas checkpoint={checkpoint} spec={spec} geometry={geometry} facing={session.facing} /></section>
    <footer>
      <div role="status">{session.error ?? session.message}</div>
      <span className="expedition-metrics">Loaded {stats.residentCells}/{RESIDENT_CELL_BUDGET} cells - Evictions {stats.evictions} - Checkpoint {checkpoint.revision}</span>
      {session.error && <button type="button" onClick={() => location.reload()}><RotateCcw size={16} />Reload</button>}
      <div className="expedition-movement" aria-label="Movement">
        {MOVES.map(({ direction, Icon }) => <button type="button" key={direction} aria-label={`Move ${direction}`} onClick={() => move(direction)} disabled={!!session.error || checkpoint.phase === 'complete'}><Icon size={22} /></button>)}
      </div>
    </footer>
  </main>;
}
