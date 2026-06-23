import type { GameState, MazeRoomKind, MazeRoomState, QuestObjective } from '../types';
import { cellKey } from '../maze/key';
import { createMazeVisibilitySnapshot } from '../maze/visibility';

export type GuildContractObjective = QuestObjective;

export type GuildContractStatus = 'posted' | 'located' | 'nearby';

export interface GuildContractTask {
  objective: GuildContractObjective;
  noun: string;
  required: number;
}

export interface GuildContract {
  id: string;
  floor: number;
  originRoomId: string;
  targetRoomId: string;
  targetRoomName: string;
  targetRoomKind: MazeRoomKind;
  objective: GuildContractObjective;
  task: GuildContractTask;
  title: string;
  description: string;
  rewardGold: number;
  status: GuildContractStatus;
}

interface GuildContractTemplate {
  task: GuildContractTask;
  titlePrefix: string;
  description: string;
  rewardBase: number;
  rewardPerFloor: number;
  priority: number;
}

const DEFAULT_TEMPLATE: GuildContractTemplate = {
  task: { objective: 'scout', noun: 'room', required: 1 },
  titlePrefix: 'Scout',
  description: 'chart and report this room',
  rewardBase: 25,
  rewardPerFloor: 10,
  priority: 3,
};

const CONTRACT_TEMPLATES: Partial<Record<MazeRoomKind, GuildContractTemplate>> = {
  boss: {
    task: { objective: 'kill', noun: 'hostiles', required: 3 },
    titlePrefix: 'Clear',
    description: 'clear the hostile room',
    rewardBase: 80,
    rewardPerFloor: 25,
    priority: 0,
  },
  treasure: {
    task: { objective: 'fetch', noun: 'guild cache', required: 1 },
    titlePrefix: 'Recover Cache:',
    description: 'recover valuables from this anchor',
    rewardBase: 55,
    rewardPerFloor: 18,
    priority: 1,
  },
  exit: {
    task: { objective: 'locate', noun: 'descent route', required: 1 },
    titlePrefix: 'Locate',
    description: 'confirm the descent route',
    rewardBase: 40,
    rewardPerFloor: 15,
    priority: 2,
  },
  safe: {
    task: { objective: 'scout', noun: 'safe room', required: 1 },
    titlePrefix: 'Scout',
    description: 'chart and verify this safe room',
    rewardBase: 35,
    rewardPerFloor: 12,
    priority: 3,
  },
};

export function guildContractsForFloor(game: GameState): GuildContract[] {
  const rooms = game.maze.layout?.rooms ?? [];
  if (rooms.length === 0) {
    return [];
  }

  const origin = rooms.find((room) => room.kind === 'hub') ?? rooms.find((room) => room.kind === 'start') ?? rooms[0];
  const visibility = createMazeVisibilitySnapshot(game.maze);

  return rooms
    .filter((room) => isContractRoom(room, origin))
    .map((room) => createContract(game.dungeonLevel, origin, room, roomStatus(room, visibility)))
    .sort((a, b) => contractPriority(a) - contractPriority(b) || a.targetRoomName.localeCompare(b.targetRoomName));
}

function createContract(floor: number, origin: MazeRoomState, target: MazeRoomState, status: GuildContractStatus): GuildContract {
  const template = templateForRoom(target.kind);
  const task = { ...template.task };

  return {
    id: `floor-${floor}:${origin.id}:${target.id}:${task.objective}`,
    floor,
    originRoomId: origin.id,
    targetRoomId: target.id,
    targetRoomName: target.name,
    targetRoomKind: target.kind,
    objective: task.objective,
    task,
    title: titleForRoom(template, target),
    description: descriptionForRoom(template, target, status),
    rewardGold: rewardForRoom(floor, template),
    status,
  };
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

function templateForRoom(kind: MazeRoomKind) {
  return CONTRACT_TEMPLATES[kind] ?? DEFAULT_TEMPLATE;
}

function titleForRoom(template: GuildContractTemplate, room: MazeRoomState) {
  return `${template.titlePrefix} ${room.name}`;
}

function descriptionForRoom(template: GuildContractTemplate, room: MazeRoomState, status: GuildContractStatus) {
  const location = status === 'posted' ? 'Unmapped room' : `${room.center.row + 1}, ${room.center.column + 1}`;
  return `Guild request: ${template.description}. Last fix: ${location}.`;
}

function rewardForRoom(floor: number, template: GuildContractTemplate) {
  const level = Math.max(1, floor);
  return template.rewardBase + level * template.rewardPerFloor;
}

function contractPriority(contract: GuildContract) {
  return templateForRoom(contract.targetRoomKind).priority;
}
