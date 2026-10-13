import type { GameState, MazeRoomState } from '../types';
import { cellKey } from '../maze/key';
import { createMazeVisibilitySnapshot } from '../maze/visibility';
import { createMazePathSearch } from '../maze/solver';
import { isInRoom } from '../quests/questTargets';
import { createGuildContract, guildContractId, guildContractPriority, type GuildContract, type GuildContractStatus } from './contractFactory';

export type { GuildContract, GuildContractObjective, GuildContractStatus, GuildContractTask } from './contractFactory';

export function guildContractsForFloor(game: GameState, acceptedIds?: ReadonlySet<string>): GuildContract[] {
  const rooms = game.maze.layout?.rooms ?? [];
  if (rooms.length === 0) {
    return [];
  }

  const origin = rooms.find((room) => room.kind === 'hub') ?? rooms.find((room) => room.kind === 'start') ?? rooms[0];
  const candidates = rooms.filter(room => isContractRoom(room, origin)
    && !acceptedIds?.has(guildContractId(game.dungeonLevel, origin.id, room)));
  if (!candidates.length) return [];
  const visibility = createMazeVisibilitySnapshot(game.maze);
  const paths = createMazePathSearch(game.maze, game.maze.start);

  return candidates
    .filter((room) => room.kind !== 'treasure' || game.chests.some((chest) =>
      chest.level === game.dungeonLevel && !chest.opened && isInRoom(chest.position, room) && Number.isFinite(paths.distanceTo(chest.position))))
    .map((room) => {
      const status = roomStatus(room, visibility);
      return createGuildContract({ floor: game.dungeonLevel, originRoomId: origin.id, target: room,
        ...(status === 'posted' ? { status } : { status, location: room.center }) });
    })
    .sort((a, b) => guildContractPriority(a) - guildContractPriority(b) || a.targetRoomName.localeCompare(b.targetRoomName));
}

function isContractRoom(room: MazeRoomState, origin: MazeRoomState) {
  return room.id !== origin.id && room.kind !== 'start' && room.kind !== 'hub' && room.tags?.includes('questRelevant');
}

function roomStatus(room: MazeRoomState, visibility: ReturnType<typeof createMazeVisibilitySnapshot>): GuildContractStatus {
  const key = cellKey(room.center);
  if (visibility.visible.has(key)) {
    return 'nearby';
  }

  if (visibility.explored.has(key)) {
    return 'located';
  }

  return 'posted';
}
