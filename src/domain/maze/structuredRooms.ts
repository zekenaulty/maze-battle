import type { GridPosition, MazeRoomKind, MazeRoomState, MazeRoomTag } from '../types';
import type { Rng } from '../combat/rng';

export interface RoomFootprint {
  row: number;
  column: number;
  rows: number;
  columns: number;
  center: GridPosition;
}

export const ROOM_BUFFER = 1;

export function placeRoomFootprints(rows: number, columns: number, rng: Rng) {
  const target = Math.min(8, Math.max(6, Math.floor(rows * columns / 640) + 5));
  const capacity = Math.ceil(rows / 2) * Math.ceil(columns / 2);
  const required = Math.min(5, capacity);
  let latticeRows = 1;
  let latticeColumns = 1;

  // Fixed, bounded search: shrink rooms before dropping a required room kind.
  for (let minimum = Math.min(rows, columns) >= 15 ? 5 : 3; minimum >= 1; minimum--) {
    let bestScore = -Infinity;
    for (let height = 1; height <= target; height++) {
      for (let width = 1; width * height <= target; width++) {
        if (height * width < required || height * minimum + (height - 1) * ROOM_BUFFER > rows ||
          width * minimum + (width - 1) * ROOM_BUFFER > columns) continue;
        const score = height * width * 100 - Math.abs(rows / height - columns / width);
        if (score <= bestScore) continue;
        bestScore = score;
        latticeRows = height;
        latticeColumns = width;
      }
    }
    if (bestScore > -Infinity) break;
  }

  const rowBands = partitionBands(rows, latticeRows);
  const columnBands = partitionBands(columns, latticeColumns);
  const footprints: RoomFootprint[] = [];
  for (const rowBand of rowBands) {
    for (const columnBand of columnBands) {
      const roomRows = randomSize(rowBand.length, rng);
      const roomColumns = randomSize(columnBand.length, rng);
      const index = footprints.length;
      const last = index === latticeRows * latticeColumns - 1;
      const row = index === 0 ? 0 : last ? rows - roomRows : rowBand.start + Math.floor(rng() * (rowBand.length - roomRows + 1));
      const column = index === 0 ? 0 : last ? columns - roomColumns : columnBand.start + Math.floor(rng() * (columnBand.length - roomColumns + 1));
      footprints.push({
        row, column, rows: roomRows, columns: roomColumns,
        center: { row: row + Math.floor(roomRows / 2), column: column + Math.floor(roomColumns / 2) },
      });
    }
  }
  return { footprints, latticeRows, latticeColumns };
}

export function nameRooms(footprints: RoomFootprint[], hubIndex: number): MazeRoomState[] {
  const specialties: MazeRoomKind[] = ['treasure', 'boss', 'safe', 'treasure', 'safe'];
  const names: Record<MazeRoomKind, string> = {
    start: 'Entry Hall', hub: 'Central Hub', exit: 'Descent Gate',
    treasure: 'Vault', boss: 'Guard Post', safe: 'Sanctuary', ordinary: 'Chamber',
  };
  let specialty = 0;
  return footprints.map((footprint, index) => {
    const kind: MazeRoomKind = index === 0 ? 'start' : index === footprints.length - 1 ? 'exit' :
      index === hubIndex ? 'hub' : specialties[specialty++];
    return { ...footprint, id: `${kind}-${index}`, kind, name: names[kind], tags: roomTagsForKind(kind) };
  });
}

export function roomTagsForKind(kind: MazeRoomKind): MazeRoomTag[] {
  switch (kind) {
    case 'ordinary': return [];
    case 'start':
    case 'hub': return ['safe', 'questRelevant'];
    case 'safe': return ['safe', 'rare', 'questRelevant'];
    case 'treasure': return ['rare', 'questRelevant'];
    case 'boss': return ['hostile', 'rare', 'questRelevant'];
    case 'exit': return ['questRelevant'];
  }
}

function partitionBands(length: number, count: number) {
  const usable = length - (count - 1) * ROOM_BUFFER;
  return Array.from({ length: count }, (_, index) => ({
    start: Math.floor(index * usable / count) + index * ROOM_BUFFER,
    length: Math.floor((index + 1) * usable / count) - Math.floor(index * usable / count),
  }));
}

function randomSize(available: number, rng: Rng) {
  const min = Math.min(3, available);
  const max = Math.min(7, available);
  return min + Math.floor(rng() * (max - min + 1));
}
