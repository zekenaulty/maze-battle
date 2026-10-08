import { useEffect, useRef, useState } from 'react';
import { Download, Play, Square } from 'lucide-react';
import { createSelfPlay, selfPlayReport, stepSelfPlay } from '../../domain/simulation/selfPlay';
import { downloadJson } from './exportDiagnostics';

export function SimulationPanel() {
  const [seed, setSeed] = useState(42);
  const [floors, setFloors] = useState(3);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState(0);
  const [report, setReport] = useState<ReturnType<typeof selfPlayReport>>();
  const [error, setError] = useState('');
  const stopped = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stopped.current = true; }; }, []);
  const run = async () => {
    stopped.current = false;
    setRunning(true); setReport(undefined); setError(''); setSteps(0);
    try {
      const state = createSelfPlay({ seed, floors, maxSteps: 10000 });
      while (state.outcome === 'running' && !stopped.current) {
        stepSelfPlay(state, 40);
        setSteps(state.steps);
        await new Promise(resolve => window.setTimeout(resolve, 0));
      }
      if (stopped.current && state.outcome === 'running') { state.outcome = 'cancelled'; state.reason = 'Stopped by user.'; }
      if (mounted.current) setReport(selfPlayReport(state));
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Simulation failed'); }
    finally { if (mounted.current) setRunning(false); }
  };
  return <section className="simulation-panel">
    <p>Separate expedition. Your saved party and inventory are unaffected.</p>
    <div className="diagnostic-toolbar">
      <label>Seed <input aria-label="Simulation seed" type="number" value={seed} disabled={running} onChange={e => setSeed(Number(e.target.value))} /></label>
      <label>Floors <input aria-label="Simulation floors" type="number" min={1} max={5} value={floors} disabled={running} onChange={e => setFloors(Math.max(1, Math.min(5, Number(e.target.value))))} /></label>
      <button type="button" disabled={running} onClick={() => void run()}><Play size={16} /> Run</button>
      {running && <button type="button" onClick={() => { stopped.current = true; }}><Square size={16} /> Stop</button>}
      {report && <button type="button" title="Export simulation" onClick={() => downloadJson(`maze-self-play-${seed}.json`, report)}><Download size={16} /> Export</button>}
    </div>
    <p role="status">{running ? `Running: ${steps} steps` : report ? `${report.outcome}: ${report.reason}` : 'Ready'}</p>
    {error && <p role="alert">{error}</p>}
    {report && <dl className="diagnostic-metrics">
      <div><dt>Steps</dt><dd>{report.steps}</dd></div><div><dt>Floors cleared</dt><dd>{report.counters.descents}</dd></div>
      <div><dt>Battles won / lost</dt><dd>{report.counters.battlesWon} / {report.counters.battlesLost}</dd></div>
      <div><dt>Chests / quests</dt><dd>{report.counters.chests} / {report.counters.quests}</dd></div>
      <div><dt>Unfinished descents</dt><dd>{report.counters.prematureDescents}</dd></div><div><dt>Portals spent</dt><dd>{report.counters.portalsUsed}</dd></div>
    </dl>}
  </section>;
}
