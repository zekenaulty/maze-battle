import { useState } from 'react';
import { ArrowLeft, Compass, Link, List, Map, Play, RotateCcw, Settings2, Square } from 'lucide-react';
import { mayPrepare } from '../../services/agentica/launch/journal';
import { LAUNCH_LIMITS } from '../../services/agentica/launch/configuration';
import { configuredDestinationLimits } from '../../config/directedTravel';
import { useLaunchSession } from './useLaunchSession';
import { LaunchSetup } from './LaunchSetup';
import { LaunchWorld } from './LaunchWorld';
import { LaunchEvents } from './LaunchEvents';
import './launch.css';

export default function AgenticaLaunchApp() {
  const { session, view, config, setConfig, selected, setSelected } = useLaunchSession();
  const [tab, setTab] = useState('setup');
  const journal = view.journal, ready = journal?.phase === 'prepared';
  const limits = configuredDestinationLimits();
  const stopping = !['idle', 'prepared', 'completed', 'failed', 'cancelled', 'loading'].includes(view.status);
  return <main className="launch-screen" data-phase={journal?.phase ?? view.status} data-moves={view.snapshot?.checkpoint.moves ?? 0}>
    <header><div><h1>Maze Battle / Agentica Lab</h1><span>{config.provider === 'fixture' ? 'Fixture' : `${config.model} / ${config.thinkingEffort}`}<i aria-hidden="true"> | </i>{view.connection}</span></div>
      <a href="/" aria-label="Main game" title="Main game"><ArrowLeft size={20} /></a>
    </header>
    <div className="launch-controls" aria-label="Run controls">
      <button type="button" onClick={() => void session.current?.start(config, selected)} disabled={!ready || view.busy}><Play size={17} />{config.provider === 'openai' ? 'Start live test' : 'Start fixture'}</button>
      <button type="button" className="launch-stop" onClick={() => void session.current?.stop()} disabled={!stopping && !view.busy}><Square size={17} />Stop</button>
      <button type="button" onClick={() => void session.current?.recover()} disabled={!journal?.runId || view.busy || journal.phase === 'running'}><RotateCcw size={17} />Recover</button>
      <button type="button" onClick={() => void session.current?.adopt()} disabled={view.status !== 'awaiting-adoption' || view.busy}><Link size={17} />Adopt</button>
      <output aria-label="Execution status">{view.status}</output>
    </div>
    {view.error && <div className="launch-error" role="alert">{view.error}</div>}
    <nav className="launch-tabs" aria-label="Test views">
      {[{ id: 'setup', label: 'Setup', Icon: Settings2 }, { id: 'room', label: 'Room', Icon: Compass },
        { id: 'map', label: 'Map', Icon: Map }, { id: 'events', label: 'Events', Icon: List }].map(({ id, label, Icon }) =>
        <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)} disabled={['room', 'map'].includes(id) && !view.snapshot}><Icon size={16} />{label}</button>)}
    </nav>
    <div className={`launch-body launch-view-${tab}`}>
      {tab === 'setup' && <LaunchSetup config={config} change={setConfig} journal={journal} selected={selected} select={setSelected}
        disabled={view.busy || !!journal && !ready && !mayPrepare(journal)} canPrepare={!view.busy && view.status !== 'loading' && mayPrepare(journal)}
        prepare={() => void session.current?.prepare(config)} />}
      {(tab === 'room' || tab === 'map') && view.snapshot && journal && <LaunchWorld snapshot={view.snapshot} slot={journal.slot} map={tab === 'map'} />}
      {tab === 'events' && <LaunchEvents view={view} />}
    </div>
    <footer>
      <div><span>Provider calls <b>{view.usage?.providerCalls ?? '?'}</b></span><span>Actions <b>{view.usage?.steps ?? '?'}/{LAUNCH_LIMITS.maxSteps}</b></span>
        <span>Refinements <b>{view.usage?.refinements ?? '?'}/{LAUNCH_LIMITS.maxRefinements}</b></span><span>Continuations <b>{view.usage?.continuations ?? '?'}/{LAUNCH_LIMITS.maxPlanContinuations}</b></span></div>
      <div><span>Run {LAUNCH_LIMITS.timeoutSeconds}s</span><span>Local window {limits.steps ?? 'unlimited'} steps / {limits.replans ?? 'unlimited'} replans / {limits.durationMs === null ? 'unlimited' : `${limits.durationMs / 1000}s`}</span>
        {view.usageError && <span>{view.usageError}</span>}</div>
    </footer>
  </main>;
}
