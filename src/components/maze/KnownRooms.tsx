import { ChevronsLeft, ChevronRight, MapPin, RotateCcw } from 'lucide-react';
import { useKnownRooms } from '../../hooks/useKnownRooms';
import type { KnownAnchor } from '../../persistence/canonical/knowledge/graph';
import type { CanonicalSnapshot } from '../../persistence/canonical/types';
import './KnownRooms.css';

interface Props {
  snapshot: CanonicalSnapshot;
  disabled: boolean;
  currentSpace: string;
  onInspect: (anchor: KnownAnchor) => void;
}

export function KnownRooms({ snapshot, disabled, currentSpace, onInspect }: Props) {
  const rooms = useKnownRooms(snapshot, !disabled);
  const nodes = rooms.page?.items ?? [];
  const rows = [...new Set(nodes.map(n => n.anchor.world.row))].sort((a, b) => a - b);
  const columns = [...new Set(nodes.map(n => n.anchor.world.column))].sort((a, b) => a - b);
  const blocked = disabled || rooms.busy;
  return <div className="known-rooms" aria-busy={rooms.busy}>
    <header className="known-rooms-toolbar">
      <h2>Room anchors</h2>
      <span>Page {rooms.number}</span>
      <button type="button" aria-label="First room page" title="First room page" onClick={rooms.first}
        disabled={blocked || rooms.number === 1 && !rooms.error}><ChevronsLeft size={18} aria-hidden="true" /></button>
      <button type="button" aria-label="Next room page" title="Next room page" onClick={rooms.next}
        disabled={blocked || !rooms.page?.next}><ChevronRight size={18} aria-hidden="true" /></button>
    </header>
    {disabled ? <p role="status">Room map paused</p> : rooms.error ? <div className="known-rooms-error">
      <p role="alert">{rooms.error}</p>
      <button type="button" onClick={rooms.first}><RotateCcw size={16} aria-hidden="true" />Retry</button>
    </div> : !rooms.page ? <p role="status">Loading rooms</p> : nodes.length === 0 ? <p role="status">No earned rooms</p> : <>
      <div className="known-rooms-map" role="group" aria-label="Earned room map"
        style={{ gridTemplateRows: `repeat(${rows.length}, minmax(56px, 1fr))`,
          gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {nodes.map((node, i) => <button key={node.spaceId} type="button" className="known-room-pin"
          style={{ gridRow: rows.indexOf(node.anchor.world.row) + 1, gridColumn: columns.indexOf(node.anchor.world.column) + 1 }}
          aria-label={`Recall room at ${node.anchor.world.row}, ${node.anchor.world.column}`}
          aria-current={currentSpace === node.spaceId ? 'location' : undefined}
          title={`Room at ${node.anchor.world.row}, ${node.anchor.world.column}`}
          disabled={blocked} onClick={() => void rooms.select(node.spaceId, onInspect)}>
          <MapPin size={22} aria-hidden="true" /><span>{i + 1}</span>
        </button>)}
      </div>
      <ol className="known-rooms-list">
        {nodes.map((node, i) => <li key={node.spaceId}><button type="button" disabled={blocked}
          aria-current={currentSpace === node.spaceId ? 'location' : undefined}
          onClick={() => void rooms.select(node.spaceId, onInspect)}>
          <span>Room {i + 1}</span><span>{node.anchor.world.row}, {node.anchor.world.column}</span>
        </button></li>)}
      </ol>
      {rooms.busy && <p role="status">Checking room anchor</p>}
    </>}
  </div>;
}
