import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { CanonicalSnapshot } from '../../persistence/canonical/types';
import { readGameplayTelemetry } from '../../persistence/canonical/telemetry/records';
import type { GameplayTrace } from '../../persistence/canonical/telemetry/types';
import './diagnostics.css';

type Loaded = { scope: string; trace?: GameplayTrace; error?: string };

export function GameplayTracePanel({ snapshot }: { snapshot: CanonicalSnapshot }) {
  const scope = JSON.stringify(snapshot), [loaded, setLoaded] = useState<Loaded>();
  useEffect(() => {
    const controller = new AbortController();
    void readGameplayTelemetry(JSON.parse(scope), { signal: controller.signal }).then(trace => {
      if (!controller.signal.aborted) setLoaded({ scope, trace });
    }, error => {
      if (!controller.signal.aborted) setLoaded({ scope, error: error instanceof Error ? error.message : String(error) });
    });
    return () => controller.abort();
  }, [scope]);
  const current = loaded?.scope === scope ? loaded : undefined;
  const trace = current?.trace;
  const download = () => {
    if (!trace) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ snapshot, ...trace }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `maze-gameplay-r${snapshot.revision}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <section className="gameplay-trace" aria-label="Gameplay trace" aria-busy={!current}>
    {current?.error ? <p role="alert">{current.error}</p> : !trace ? <p role="status">Loading events...</p> : <>
      <header><span>{trace.events.length} recent events | sequence {trace.sequence}</span>
        <button type="button" title="Download gameplay trace" aria-label="Download gameplay trace" onClick={download}><Download size={18} aria-hidden="true" /></button></header>
      {!trace.events.length && <p>No gameplay events recorded.</p>}
      <ol>{[...trace.events].reverse().map(entry => <li key={entry.sequence}><details>
        <summary>r{entry.revision} | {entry.fact.kind === 'battle' ? `Battle ${entry.fact.event}` : entry.fact.command} | {entry.at}</summary>
        <pre>{JSON.stringify(entry.fact, null, 2)}</pre>
      </details></li>)}</ol>
    </>}
  </section>;
}
