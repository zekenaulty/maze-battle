import { useState } from 'react';
import { Eye, Map, Search } from 'lucide-react';
import type { MemoryContextSelection } from '../../domain/directed/contextSelection';
import type { DirectedDestinationMemory, DirectedMemoryOverview, MemoryRoute, RoomMemorySummary } from '../../domain/directed/memory';
import type { PresentedContext } from '../../domain/directed/types';

const routeLabel = (route: MemoryRoute) => route.status === 'known-route'
  ? `${route.firstRouteDirection ?? 'here'}, ${route.distance} steps` : route.status === 'inaccessible' ? 'No known route' : 'Unknown';

export function DirectedMemory({ context, busy, recall }: {
  context?: PresentedContext; busy: boolean; recall: (selection: MemoryContextSelection) => unknown;
}) {
  const [kind, setKind] = useState<'room' | 'feature'>('feature');
  const [id, setId] = useState('V');
  const data: DirectedMemoryOverview | DirectedDestinationMemory | undefined = context && JSON.parse(context.json);
  const lookup = () => id.trim() && void recall({ kind: 'destination', target: kind === 'room'
    ? { kind, roomId: id.trim() } : { kind, featureId: id.trim() } });
  const room = (value: RoomMemorySummary, scope: string) => <tr key={value.roomId}>
    <td>{scope}</td><td>{value.name ?? value.roomId}</td><td>{value.geographicBearing.direction}</td>
    <td>{routeLabel(value.route)}</td><td>{value.evidence.status}</td><td>
      <button title={`Recall ${value.name ?? value.roomId}`} aria-label={`Recall ${value.name ?? value.roomId}`}
        disabled={busy} onClick={() => void recall({ kind: 'destination', target: { kind: 'room', roomId: value.roomId } })}><Eye size={16} /></button>
    </td></tr>;
  return <div role="tabpanel" aria-label="Memory" className="directed-memory">
    <form className="directed-actions" onSubmit={event => { event.preventDefault(); lookup(); }}>
      <button type="button" title="Memory overview" aria-label="Memory overview" disabled={busy}
        onClick={() => void recall({ kind: 'overview' })}><Map size={18} /></button>
      <label>Recall<select aria-label="Recall kind" value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
        <option value="feature">Feature</option><option value="room">Room</option>
      </select></label>
      <label>Known ID<input aria-label="Recall ID" value={id} maxLength={160} onChange={event => setId(event.target.value)} /></label>
      <button type="submit" aria-label="Recall destination" title="Recall destination" disabled={busy || !id.trim()}><Search size={18} /></button>
    </form>
    {data && <div className="directed-memory-result">
      <div className="directed-memory-meta">Revision {data.knowledgeRevision} / {context!.bytes} bytes / {data.sourceIds.length} sources</div>
      {data.kind === 'overview' ? <>
        <strong>{data.currentRoom.space?.value.name ?? data.currentRoom.roomId}</strong>
        <span> / {data.currentRoom.cells.length} mapped cells / {data.currentRoom.features.length} known features</span>
        <table><thead><tr><th>Scope</th><th>Room</th><th>Bearing</th><th>Route</th><th>Evidence</th><th /></tr></thead>
          <tbody>{data.nearby.map(value => room(value, 'Near'))}{data.distant.map(value => room(value, 'Distant'))}</tbody></table>
      </> : <dl className="directed-memory-facts">
        <div><dt>Destination</dt><dd>{data.feature?.value.name ?? data.room?.name ?? (data.target.kind === 'feature'
          ? data.target.featureId : data.target.kind === 'room' ? data.target.roomId : `${data.target.address.spaceId}:${data.target.address.column},${data.target.address.row}`)}</dd></div>
        <div><dt>Knowledge</dt><dd>{data.status}</dd></div><div><dt>Bearing</dt><dd>{data.geographicBearing.direction}</dd></div>
        <div><dt>Route</dt><dd>{routeLabel(data.route)}</dd></div>
        <div><dt>Evidence</dt><dd>{data.feature?.evidence.status ?? data.room?.evidence.status ?? 'Unknown'}</dd></div>
        {data.feature && <div><dt>Examination</dt><dd>{data.examination?.value.detail ?? 'Uninspected'}</dd></div>}
      </dl>}
      <div className="directed-memory-meta">Omitted detail: {data.omissions.cells} cells, {data.omissions.features} features, {data.omissions.rooms} rooms</div>
      <details><summary>Source context</summary><pre>{context!.json}</pre></details>
    </div>}
  </div>;
}
