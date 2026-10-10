import type { ChestState, Direction, MazeRoomKind, MazeRoomState, MazeState, QuestObjective, QuestState } from '../types';

export function lineMaze(columns: number, rooms: MazeRoomState[] = [], active = 0, start = 0, end = columns - 1): MazeState {
  return {
    rows: 1, columns, start: { row: 0, column: start }, end: { row: 0, column: end }, active: { row: 0, column: active },
    visited: [{ row: 0, column: active }],
    layout: rooms.length ? { version: 'structured-v1', rooms, mainPath: [], zones: [] } : undefined,
    cells: Array.from({ length: columns }, (_, column) => {
      const links: Direction[] = [];
      if (column > 0) links.push('west');
      if (column < columns - 1) links.push('east');
      return { row: 0, column, links };
    }),
  };
}

export function roomAt(id: string, kind: MazeRoomKind, column: number): MazeRoomState {
  return { id, name: id, kind, row: 0, column, rows: 1, columns: 1, center: { row: 0, column }, tags: ['questRelevant'] };
}

export function chestAt(column: number, opened = false): ChestState {
  return { id: `chest-${column}`, level: 1, position: { row: 0, column }, opened };
}

export function questFor(room: MazeRoomState, objective: QuestObjective, required = 1): QuestState {
  return {
    id: `test-${room.id}-${objective}`, source: 'guild', floor: 1, originRoomId: 'hub', targetRoomId: room.id,
    targetRoomName: room.name, targetRoomKind: room.kind, title: `${objective} ${room.name}`, description: '',
    task: { objective, noun: room.name, required, progress: 0 }, reward: { gold: 10 }, status: 'active', acceptedAt: '2026-10-08T00:00:00Z',
  };
}

export function seededRng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
