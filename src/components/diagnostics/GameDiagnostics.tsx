import { useId, useState } from 'react';
import type { CanonicalSnapshot } from '../../persistence/canonical/types';
import type { GameDiagnostic } from '../../services/game/GameView';
import { Dialog } from '../Dialog';
import { GameplayTracePanel } from './GameplayTrace';

export function GameDiagnostics({ snapshot, diagnostics, onClose }: {
  snapshot: CanonicalSnapshot; diagnostics: GameDiagnostic[]; onClose: () => void;
}) {
  const [tab, setTab] = useState<'storage' | 'gameplay'>('storage'), id = useId();
  const tabs = ['storage', 'gameplay'] as const;
  return <Dialog title="Diagnostics" onClose={onClose}>
    <div role="tablist" aria-label="Diagnostics" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'storage' : event.key === 'End' ? 'gameplay' : tab === 'storage' ? 'gameplay' : 'storage';
      setTab(next); document.getElementById(`${id}-${next}`)?.focus();
    }}>{tabs.map(value => <button key={value} id={`${id}-${value}`} type="button" role="tab"
      tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} aria-controls={`${id}-panel`} onClick={() => setTab(value)}>
      {value === 'storage' ? 'Storage' : 'Gameplay'}</button>)}</div>
    <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
      {tab === 'gameplay' ? <GameplayTracePanel snapshot={snapshot} /> : <>
        <p>Revision {snapshot.revision}</p>
        <table><thead><tr><th>Action</th><th>Reads</th><th>Writes</th><th>Logical bytes written</th><th>ms</th></tr></thead>
          <tbody>{diagnostics.slice().reverse().map(d => <tr key={d.revision}>
            <td>{d.action}</td><td>{d.stats.reads}</td><td>{d.stats.writes}</td><td>{d.stats.writeBytes}</td><td>{Math.round(d.elapsedMs)}</td>
          </tr>)}</tbody></table>
      </>}
    </section>
  </Dialog>;
}
