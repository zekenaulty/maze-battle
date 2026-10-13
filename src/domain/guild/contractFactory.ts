import type { GridPosition, MazeRoomKind, QuestItemSpec, QuestObjective } from '../types';

export type GuildContractObjective = QuestObjective;
export type GuildContractStatus = 'posted' | 'located' | 'nearby';

export interface GuildContractTask {
  objective: GuildContractObjective;
  noun: string;
  required: number;
  item?: QuestItemSpec;
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

export interface GuildContractTarget {
  id: string;
  kind: MazeRoomKind;
  name: string;
}

export interface GuildContractInput {
  floor: number;
  originRoomId: string;
  target: GuildContractTarget;
  status?: GuildContractStatus;
  location?: GridPosition;
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
    task: { objective: 'fetch', noun: 'guild cache', required: 1,
      item: { baseId: 'guild-cache', displayName: 'Guild Cache', token: '\u{1f4e6}' } },
    titlePrefix: 'Recover Cache:',
    description: 'recover the guild cache from a chest in this room',
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

/** Discovery and observation belong to the caller; no hidden room geometry is required. */
export function createGuildContract(input: GuildContractInput): GuildContract {
  const { floor, originRoomId, target } = input;
  const status = input.status ?? 'posted';
  const template = templateForRoom(target.kind);
  const task = { ...template.task, ...(template.task.item ? { item: { ...template.task.item } } : {}) };
  const location = status !== 'posted' && input.location
    ? `${input.location.row + 1}, ${input.location.column + 1}` : 'Unmapped room';

  return {
    id: guildContractId(floor, originRoomId, target),
    floor,
    originRoomId,
    targetRoomId: target.id,
    targetRoomName: target.name,
    targetRoomKind: target.kind,
    objective: task.objective,
    task,
    title: `${template.titlePrefix} ${target.name}`,
    description: `Guild request: ${template.description}. Last fix: ${location}.`,
    rewardGold: template.rewardBase + Math.max(1, floor) * template.rewardPerFloor,
    status,
  };
}

export function guildContractId(floor: number, originRoomId: string, target: Pick<GuildContractTarget, 'id' | 'kind'>): string {
  return `floor-${floor}:${originRoomId}:${target.id}:${templateForRoom(target.kind).task.objective}`;
}

export function guildContractPriority(contract: GuildContract): number {
  return templateForRoom(contract.targetRoomKind).priority;
}

function templateForRoom(kind: MazeRoomKind) {
  return CONTRACT_TEMPLATES[kind] ?? DEFAULT_TEMPLATE;
}
