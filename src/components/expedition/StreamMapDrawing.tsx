import { useId } from 'react';
import { addressKey, sameAddress } from '../../domain/expedition/address';
import type { CellAddress, KnownOpening } from '../../domain/expedition/types';
import type { KnownFrontier, StreamKnowledgePage } from '../../domain/expedition/streaming/types';

const directions = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] } as const;
const center = (cell: CellAddress) => ({ x: cell.column * 20 + 10, y: cell.row * 20 + 10 });

function Port({ port, frontier = false }: { port: KnownOpening | KnownFrontier; frontier?: boolean }) {
  const { x, y } = center(port), [dx, dy] = directions[port.direction];
  const px = x + dx * 9, py = y + dy * 9;
  const destination = 'destination' in port ? port.destination : undefined;
  return <g className={frontier ? 'stream-map-frontier' : 'stream-map-door'} data-observed-at={port.observedAt}>
    <title>{`${frontier ? 'Frontier' : 'Door'} ${port.id}, ${port.direction}${destination ? ` to ${destination.spaceId}` : ''}; observed at revision ${port.observedAt}`}</title>
    {frontier ? <rect x={px - 3} y={py - 3} width={6} height={6} />
      : <line x1={px - dy * 4} y1={py + dx * 4} x2={px + dy * 4} y2={py - dx * 4} />}
  </g>;
}

/** Pure saved-evidence drawing. Blank space is unknown, not generated floor or walls. */
export function StreamMapDrawing({ knowledge, current }: { knowledge: StreamKnowledgePage; current: CellAddress }) {
  const title = useId(), description = useId();
  const cells = Object.values(knowledge.cells);
  if (!cells.length) return <div className="stream-map-empty">No saved cells.</div>;
  const minRow = Math.min(...cells.map(cell => cell.row)), maxRow = Math.max(...cells.map(cell => cell.row));
  const minColumn = Math.min(...cells.map(cell => cell.column)), maxColumn = Math.max(...cells.map(cell => cell.column));
  const width = Math.max(9, maxColumn - minColumn + 1) * 20 + 24;
  const height = Math.max(9, maxRow - minRow + 1) * 20 + 24;
  const left = (minColumn + maxColumn + 1) * 10 - width / 2, top = (minRow + maxRow + 1) * 10 - height / 2;
  const at = cells.find(cell => sameAddress(cell, current));
  return <svg className="stream-map-drawing" viewBox={`${left} ${top} ${width} ${height}`} role="img" aria-labelledby={`${title} ${description}`}>
    <title id={title}>{`Observed map of ${knowledge.spaceId}`}</title>
    <desc id={description}>{`${cells.length} saved cells; ${Object.keys(knowledge.chests).length} known chests.`}</desc>
    {cells.map(cell => {
      const { x, y } = center(cell);
      return <g key={addressKey(cell)} data-map-cell={addressKey(cell)} data-observed-at={cell.observedAt}>
        <title>{`Cell ${cell.row + 1}, ${cell.column + 1}; observed at revision ${cell.observedAt}`}</title>
        <rect className="stream-map-floor" x={x - 8} y={y - 8} width={16} height={16} />
        {cell.links.map(direction => {
          const [dx, dy] = directions[direction];
          return <line className="stream-map-link" key={direction} x1={x} y1={y} x2={x + dx * 10} y2={y + dy * 10} />;
        })}
      </g>;
    })}
    {Object.values(knowledge.chests).map(chest => {
      const { x, y } = center(chest);
      return <g className={`stream-map-chest${chest.opened ? ' is-opened' : ''}`} key={chest.id} data-observed-at={chest.observedAt}>
        <title>{`${chest.opened ? 'Opened' : 'Unopened'} chest ${chest.id}; observed at revision ${chest.observedAt}`}</title>
        <rect x={x - 4} y={y - 3} width={8} height={6} /><path d={`M${x - 4} ${y - 1}h8m-4 0v3`} />
      </g>;
    })}
    {Object.values(knowledge.openings).map(port => <Port port={port} key={`door:${port.id}`} />)}
    {Object.values(knowledge.frontiers).map(port => <Port port={port} frontier key={`frontier:${port.id}`} />)}
    {at && <g className="stream-map-player" data-current-cell={addressKey(at)}>
      <title>Current position</title>
      <path d={`M${center(at).x} ${center(at).y - 5}l5 5-5 5-5-5z`} />
    </g>}
  </svg>;
}
