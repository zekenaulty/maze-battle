import type { StreamKnowledgePage } from '../../../domain/expedition/streaming/types';
import { sameAddress } from '../../../domain/expedition/address';
import type { CellAddress, KnownOpening } from '../../../domain/expedition/types';

const address = (value: CellAddress) => ({ spaceId: value.spaceId, row: value.row, column: value.column });
const opening = (value: KnownOpening) => ({ ...address(value), id: value.id, direction: value.direction,
  observedAt: value.observedAt, ...(value.destination ? { destination: address(value.destination) } : {}) });

export function roomView(page: StreamKnowledgePage, offset: number, limit: number) {
  const ordered = Object.values(page.cells).sort((a, b) => a.row - b.row || a.column - b.column);
  const cells = ordered.slice(offset, offset + limit);
  const included = (value: CellAddress) => cells.some(cell => sameAddress(cell, value));
  return { kind: 'room' as const, status: 'known' as const, spaceId: page.spaceId,
    asOfRevision: page.revision, offset, limit, totalCells: ordered.length,
    nextOffset: offset + cells.length < ordered.length ? offset + cells.length : null,
    cells: cells.map(cell => ({ ...address(cell), links: [...cell.links], observedAt: cell.observedAt })),
    chests: Object.values(page.chests).filter(included).map(chest => ({ ...address(chest), id: chest.id,
      opened: chest.opened, observedAt: chest.observedAt })),
    openings: Object.values(page.openings).filter(included).map(opening),
    frontiers: Object.values(page.frontiers).filter(included).map(frontier => ({ ...address(frontier),
      id: frontier.id, direction: frontier.direction, observedAt: frontier.observedAt })) };
}
export type RoomView = ReturnType<typeof roomView>;
