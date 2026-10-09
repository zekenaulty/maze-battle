import { useId } from 'react';
import { Box, Check, ChevronRight, DoorOpen, LocateFixed, Map, RefreshCw, SkipBack, SquareDashed } from 'lucide-react';
import type { CellAddress } from '../../domain/expedition/types';
import { StreamMapDrawing } from './StreamMapDrawing';
import { useStreamMapPanel, type MapStatus } from './useStreamMapPanel';
import './streamMap.css';

export interface StreamMapPanelProps { slot: string; current: CellAddress; revision: number }
const messages: Partial<Record<MapStatus, string>> = {
  stale: 'Map changed since this checkpoint.', corrupt: 'Saved map is inconsistent.',
  unavailable: 'Saved map is unavailable.', unknown: 'No saved observations for this room.',
};

export function StreamMapPanel({ slot, current, revision }: StreamMapPanelProps) {
  const map = useStreamMapPanel(slot, current.spaceId, revision);
  const headingId = useId(), selectId = useId();
  const ready = map.listStatus === 'ready';
  const status = ready ? map.pageStatus : map.listStatus;
  const selectedInList = map.summaries.some(summary => summary.spaceId === map.selectedId);
  return <section className="stream-map-panel" aria-labelledby={headingId}
    data-summary-count={map.summaries.length} data-room-page-count={Number(Boolean(map.page))}
    onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) event.stopPropagation(); }}>
    <div className="stream-map-toolbar">
      <h2 id={headingId}><Map size={18} aria-hidden="true" />Discovered rooms</h2>
      <div className="stream-map-controls" role="group" aria-label="Map pages">
        <button type="button" title="First page" aria-label="First page" onClick={map.first} disabled={!ready || !map.cursor}><SkipBack size={16} /><span>First</span></button>
        <button type="button" title="Next page" aria-label="Next page" onClick={map.next} disabled={!ready || !map.nextCursor}><ChevronRight size={16} /><span>Next</span></button>
        <button type="button" title="Current room" aria-label="Current room" onClick={map.current} disabled={!ready}><LocateFixed size={16} /><span>Current room</span></button>
        <button type="button" title="Refresh map" aria-label="Refresh map" onClick={map.refresh}><RefreshCw size={16} /></button>
      </div>
    </div>
    <div className="stream-map-body" aria-busy={status === 'loading'}>
      <div className="stream-map-room-list">
        <label className="stream-map-mobile-label" htmlFor={selectId}>Saved room</label>
        <select id={selectId} className="stream-map-select" title={map.selectedId} value={map.selectedId} disabled={!ready} onChange={event => map.select(event.target.value)}>
          {!selectedInList && <option value={map.selectedId}>{map.selectedId || 'Loading...'}</option>}
          {map.summaries.map(summary => <option key={summary.spaceId} value={summary.spaceId}>{summary.spaceId}{summary.cleared ? ' (cleared)' : ''}</option>)}
        </select>
        <ul aria-label="Discovered rooms on this page">
          {map.summaries.map(summary => <li key={summary.spaceId}>
            <button type="button" aria-label={`Show saved room ${summary.spaceId}`} aria-pressed={summary.spaceId === map.selectedId} onClick={() => map.select(summary.spaceId)}>
              <span className="stream-map-room-name">{summary.spaceId}</span>
              {summary.spaceId === current.spaceId ? <LocateFixed size={14} aria-label="Current room" /> : summary.cleared && <Check size={14} aria-label="Cleared" />}
              <span className="stream-map-room-meta">{summary.knownCells} cells <span>{summary.openedChests}/{summary.knownChests} chests</span></span>
            </button>
          </li>)}
        </ul>
      </div>
      <div className="stream-map-detail">
        <div className="stream-map-detail-heading"><h3>{map.selectedId || 'Saved room'}</h3>
          {map.page && <span>Page revision {map.page.pageRevision} / View {map.page.view.revision}</span>}
        </div>
        <div className="stream-map-viewport">
          {map.page && status === 'ready' ? <StreamMapDrawing knowledge={map.page.knowledge} current={current} />
            : <p role={status === 'corrupt' || status === 'unavailable' ? 'alert' : 'status'}>{status === 'loading'
              ? ready ? 'Loading saved room...' : 'Loading discovered rooms...' : messages[status]}</p>}
        </div>
        <div className="stream-map-legend" aria-label="Map legend">
          <span><LocateFixed size={13} />Current</span><span><Box size={13} />Chest</span>
          <span><DoorOpen size={13} />Door</span><span><SquareDashed size={13} />Frontier</span>
        </div>
      </div>
    </div>
  </section>;
}

export default StreamMapPanel;
