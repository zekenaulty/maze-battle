import { Download, ExternalLink } from 'lucide-react';
import type { LaunchView } from '../../services/agentica/launch/session';
import { labHttpUrl } from '../../services/agentica/launch/configuration';

export function LaunchEvents({ view }: { view: LaunchView }) {
  const { journal } = view;
  const download = () => {
    const blob = new Blob([JSON.stringify({ journal, usage: view.usage, status: view.status, checkpoint: view.snapshot?.checkpoint }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `maze-lab-${journal?.slot ?? 'unprepared'}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="launch-events" aria-label="Run events">
    <div className="launch-event-heading"><h2>Recent Events</h2><button type="button" onClick={download} title="Export test evidence" aria-label="Export test evidence"><Download size={18} /></button>
      {journal?.runId && <a href={labHttpUrl(journal.config.url, `/api/runs/${encodeURIComponent(journal.runId)}`)} target="_blank" rel="noreferrer"><ExternalLink size={16} />Lab run</a>}</div>
    <p className="launch-run-id">{journal?.runId ?? 'No service run'}</p>
    <ol>{[...(journal?.events ?? [])].reverse().map((event, index) => <li key={`${event.time}-${index}`}>
      <time>{new Date(event.time).toLocaleTimeString()}</time><strong>{event.type}</strong><span>{event.text}</span>
    </li>)}</ol>
  </section>;
}
