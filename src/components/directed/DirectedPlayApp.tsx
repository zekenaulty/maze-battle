import { useMemo, useState } from 'react';
import { ArrowLeft, Eye, Hand, Navigation, Pause, Play, Square } from 'lucide-react';
import { useDirectedPlay } from '../../hooks/useDirectedPlay';
import { directedViewModel } from '../../viewModels/directedViewModel';
import { DirectedCanvas } from './DirectedCanvas';
import './directed.css';

export default function DirectedPlayApp() {
  const game = useDirectedPlay();
  const [tab, setTab] = useState<'travel' | 'evidence'>('travel');
  const [selected, setSelected] = useState('V');
  const view = useMemo(() => game.context && directedViewModel(game.context), [game.context]);
  const operation = game.session?.operation;
  const running = operation?.status === 'running';
  if (!view) return <main className="loading-screen"><p role="status">{game.error ?? 'Loading directed play'}</p></main>;
  const feature = view.features.find(f => f.value.id === selected);
  return <main className="directed-screen" data-operation={operation?.status ?? 'idle'} data-steps={operation?.steps ?? 0}>
    <header className="directed-header">
      <div><h1>Directed Expedition</h1><span>{view.spaces.find(s => s.value.id === view.position.spaceId)?.value.name} / F1</span></div>
      <a href="/?expedition=2" title="Streamed expedition" aria-label="Streamed expedition"><ArrowLeft size={20} /></a>
    </header>
    <section className="directed-scene"><DirectedCanvas view={view} /></section>
    <section className="directed-controls">
      <div role="tablist" aria-label="Expedition panels">
        <button role="tab" aria-selected={tab === 'travel'} onClick={() => setTab('travel')}>Travel</button>
        <button role="tab" aria-selected={tab === 'evidence'} onClick={() => setTab('evidence')}>Evidence</button>
      </div>
      {tab === 'travel' ? <div role="tabpanel" aria-label="Travel">
        <div className="directed-actions">
          <label>Destination<select aria-label="Destination" value={selected} disabled={running || game.busy} onChange={event => setSelected(event.target.value)}>
            {view.features.map(({ value }) => <option key={value.id} value={value.id}>{value.name}</option>)}
            <option value="home">Hall center</option>
          </select></label>
          <button onClick={() => game.navigate(selected === 'home' ? { kind: 'cell', address: { spaceId: 'H', row: 2, column: 2 }, arrival: 'occupy' }
            : { kind: 'feature', featureId: selected, arrival: 'adjacent' })} disabled={running || game.busy || !game.controlled}>
            <Navigation size={17} />Travel</button>
          <button aria-label={game.playing && running ? 'Pause travel' : 'Resume travel'} title={game.playing && running ? 'Pause travel' : 'Resume travel'}
            disabled={!running || !game.controlled} onClick={game.playing ? game.pause : game.resume}>{game.playing && running ? <Pause size={18} /> : <Play size={18} />}</button>
          <button aria-label="Cancel travel" title="Cancel travel" disabled={!running || !game.controlled} onClick={game.cancel}><Square size={18} /></button>
          <button aria-label="Look around" title="Look around" disabled={game.busy || running || !game.controlled} onClick={() => void game.dispatch({ type: 'look' })}><Eye size={18} /></button>
          <button aria-label="Interact with destination" title="Interact with destination" disabled={game.busy || running || !feature || !game.controlled}
            onClick={() => void game.dispatch({ type: 'interact', featureId: selected })}><Hand size={18} /></button>
          {!game.controlled && <button onClick={game.takeControl} disabled={game.busy}><Hand size={17} />Take control</button>}
        </div>
        <div className="directed-details"><span>{feature ? `${feature.value.name}: ${feature.value.state} (${feature.status})` : 'Hall center'}</span>
          <label>Pace<input type="range" aria-label="Travel pace" min={120} max={900} step={20} value={game.delay} onChange={event => game.setDelay(Number(event.target.value))} /><output>{game.delay}ms</output></label>
        </div>
      </div> : <div role="tabpanel" aria-label="Evidence" className="directed-evidence">
        <dl><div><dt>Steps / bound</dt><dd>{operation?.steps ?? 0} / 64</dd></div><div><dt>Replans / bound</dt><dd>{operation?.replans ?? 0} / 4</dd></div>
          <div><dt>Knowledge revision</dt><dd>{view.knowledgeRevision}</dd></div><div><dt>Context bytes</dt><dd>{view.bytes}</dd></div><div><dt>Provider calls</dt><dd>0 (host-only)</dd></div></dl>
        <details><summary>Presented context</summary><pre>{game.context!.json}</pre></details>
      </div>}
    </section>
    <footer role="status" aria-label="Travel status">{game.error ?? (running && !game.playing ? 'Travel paused. Resume to continue the same intention.' : operation?.reason ?? 'Ready.')}</footer>
  </main>;
}
