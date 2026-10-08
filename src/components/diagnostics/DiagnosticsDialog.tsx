import { useState } from 'react';
import { Download } from 'lucide-react';
import type { GameState } from '../../domain/types';
import type { PlayTelemetry } from '../../domain/telemetry/types';
import { Dialog } from '../Dialog';
import { downloadDiagnostics } from './exportDiagnostics';
import { SimulationPanel } from './SimulationPanel';
import { inventoryDiagnostics } from '../../domain/items/inventoryDiagnostics';
import './diagnostics.css';

export function DiagnosticsDialog({ game, telemetry, onClose }: { game: GameState; telemetry: PlayTelemetry; onClose: () => void }) {
  const [tab, setTab] = useState('Overview');
  const [source, setSource] = useState('all');
  const counters = telemetry.counters;
  const inventory = inventoryDiagnostics(game);
  const events = telemetry.events.filter(e => source === 'all' || e.source === source).slice(-100).reverse();
  return <Dialog title="Diagnostics" onClose={onClose}>
    <div className="diagnostic-panel">
      <div className="diagnostic-toolbar">
        <nav aria-label="Diagnostics views">{['Overview', 'Events', 'Self-play'].map(name => <button type="button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
        <button type="button" title="Export diagnostics and save snapshot" onClick={() => downloadDiagnostics(game, telemetry)}><Download size={16} /> Export</button>
      </div>
      {tab === 'Overview' && <>
        <p>{game.autopilot?.reason ?? 'Manual exploration'}{game.autopilot?.targetId ? ` - ${game.autopilot.targetId}` : ''}</p>
        <dl className="diagnostic-metrics">
          <div><dt>Manual / Auto actions</dt><dd>{telemetry.sources.manual} / {telemetry.sources.auto}</dd></div>
          <div><dt>Pack / Stash slots</dt><dd>{inventory.pack.used}/{inventory.pack.capacity} / {inventory.stash.used}/{inventory.stash.capacity}</dd></div>
          <div><dt>Ambiguous / Invalid item records</dt><dd>{inventory.ambiguousIds.length} / {inventory.invalidQuantityIds.length + inventory.missingEquipment.length}</dd></div>
          <div><dt>Moves / Revisits</dt><dd>{counters.moves} / {counters.revisits}</dd></div>
          <div><dt>Floors / Unfinished descents</dt><dd>{counters.descents} / {counters.prematureDescents}</dd></div>
          <div><dt>Chests / Quests</dt><dd>{counters.chests} / {counters.quests}</dd></div>
          <div><dt>Battles won / lost</dt><dd>{counters.battlesWon} / {counters.battlesLost}</dd></div>
          <div><dt>Kills</dt><dd>{counters.kills}</dd></div>
          <div><dt>Blocked / Waiting actions</dt><dd>{counters.blocked} / {counters.noProgress}</dd></div>
          <div><dt>Gold net gains / losses per action</dt><dd>{counters.goldGained} / {counters.goldSpent}</dd></div>
          <div><dt>Items added / removed</dt><dd>{counters.itemsAdded} / {counters.itemsRemoved}</dd></div>
          <div><dt>Portals spent</dt><dd>{counters.portalsUsed}</dd></div>
          <div><dt>Net HP lost / gained per action</dt><dd>{counters.damageTaken} / {counters.healing}</dd></div>
          <div><dt>Decision mean / peak</dt><dd>{(counters.totalDecisionMs / Math.max(1, counters.actions)).toFixed(2)} / {counters.maxDecisionMs.toFixed(2)} ms</dd></div>
          <div><dt>Retained events / total actions</dt><dd>{telemetry.events.length} / {counters.actions}</dd></div>
        </dl>
      </>}
      {tab === 'Events' && <>
        <label>Source <select aria-label="Event source" value={source} onChange={e => setSource(e.target.value)}><option value="all">All</option><option value="manual">Manual</option><option value="auto">Auto</option><option value="system">System</option></select></label>
        <ol className="diagnostic-events">{events.map(event => <li key={event.sequence}>
          <strong>#{event.sequence} {event.source} / {event.action}</strong>
          <span>Floor {event.floor} ({event.position.row + 1}, {event.position.column + 1}) - {event.mode}</span>
          {event.reason && <span>{event.reason}</span>}
          <small>{Object.entries(event.changes).filter(([key]) => key !== 'actions').map(([key, value]) => `${key}: ${value}`).join(', ') || 'No state progress'}</small>
        </li>)}</ol>
      </>}
      {tab === 'Self-play' && <SimulationPanel />}
    </div>
  </Dialog>;
}
