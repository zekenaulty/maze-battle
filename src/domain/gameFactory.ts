import type { ActorState, BattleState, Direction, EnemyState, GameMode, GameState, GridPosition, HeroRole, InventoryPolicy, MazeFloorState, MazeLayoutState, MazeTextureId, MonsterCategory, QuestState, SkillState } from './types';
import { generateStructuredMaze, roomTagsForKind } from './maze/structuredGenerate';
import { generateModuleMaze } from './maze/moduleGenerate';
import { normalizeModuleMetadata } from './maze/moduleLayout';
import { createModuleRecipe } from './expedition/topology/modules/policy';
import { samePosition } from './maze/key';
import { canMove, mazeCellAt, movePosition } from './maze/movement';
import { generateChestsForMaze, normalizeChests } from './items/chests';
import { createInitialInventory, createInitialStash, normalizeInventory, normalizeInventoryPolicy, normalizeStash } from './items/inventory';
import { normalizeAutoThrottleMs } from './automation/throttle';
import { normalizeAutopilot } from './automation/autopilotState';
import { normalizeMazeTexture } from './maze/textureOptions';
import { revealMazeVisibility } from './maze/visibility';
import { updateQuestProgress } from './quests/quests';
import { monsterTagsForFloor, normalizeMonsterTags } from './combat/monsters';
import { defaultRng, type Rng } from './combat/rng';
import { roomAtPosition } from './quests/questTargets';
import { duplicateItemIds } from './items/itemOwnership';
import { createInitialParty } from './party/factory';

const nowIso = () => new Date().toISOString();

type StoredActor = Partial<Omit<ActorState, 'autoSpendPoints'>> & { autoSpendPoints?: unknown };
type StoredBattle = Partial<Omit<BattleState, 'enemies' | 'rewardGold'>> & { enemies?: Partial<EnemyState>[]; rewardGold?: unknown };
type StoredGameState = Partial<Omit<GameState, 'battle' | 'floors' | 'party' | 'inventoryPolicy' | 'townReturnMode' | 'automationPaused'>> & {
  battle?: StoredBattle;
  floors?: Partial<MazeFloorState>[];
  party?: StoredActor[];
  quests?: Partial<QuestState>[];
  monsterTags?: MonsterCategory[];
  inventoryPolicy?: Partial<InventoryPolicy>;
  townReturnMode?: unknown;
  automationPaused?: unknown;
};

type GameStateOverrides = Partial<Omit<GameState, 'floors' | 'maze' | 'inventoryPolicy' | 'automationPaused'>> & {
  floors?: Partial<MazeFloorState>[];
  maze?: Partial<GameState['maze']>;
  inventoryPolicy?: Partial<InventoryPolicy>;
  automationPaused?: boolean;
};

export function createNewGameState(overrides: GameStateOverrides = {}): GameState {
  const now = nowIso();
  const id = overrides.id ?? crypto.randomUUID();
  const dungeonLevel = overrides.dungeonLevel ?? 1;
  const mazeMaxRooms = overrides.mazeMaxRooms ?? 32;
  const maze = overrides.maze ? normalizeMaze(overrides.maze, 9, 13) : nextLevelMaze(id, dungeonLevel, defaultRng);
  const monsterTags = normalizeMonsterTags(overrides.monsterTags, dungeonLevel);
  const floors = normalizeFloors(overrides.floors, dungeonLevel, mazeMaxRooms, maze, monsterTags);
  const protectedIds = duplicateItemIds([...(overrides.inventory?.items ?? []), ...(overrides.stash?.items ?? [])]);
  const inventory = normalizeInventory(overrides.inventory ?? createInitialInventory(), protectedIds);
  const stash = normalizeStash(overrides.stash ?? createInitialStash(), protectedIds);
  const chests = normalizeChests(overrides.chests, dungeonLevel, maze);

  return {
    schemaVersion: 1,
    id,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    dungeonLevel,
    wave: overrides.wave ?? 0,
    mazeMaxRooms,
    monsterTags,
    mazeTexture: normalizeMazeTexture(overrides.mazeTexture),
    autoThrottleMs: normalizeAutoThrottleMs(overrides.autoThrottleMs),
    randomBattles: overrides.randomBattles ?? true,
    inventoryPolicy: overrides.inventoryPolicy === undefined ? undefined : normalizeInventoryPolicy(overrides.inventoryPolicy),
    ...(typeof overrides.automationPaused === 'boolean' ? { automationPaused: overrides.automationPaused } : {}),
    autopilot: normalizeAutopilot(overrides.autopilot, dungeonLevel),
    townReturnMode: normalizeTownReturnMode(overrides.townReturnMode),
    mode: overrides.mode ?? 'manual',
    facing: overrides.facing ?? 'south',
    maze,
    floors,
    chests,
    inventory,
    stash,
    party:
      overrides.party?.map((actor) => ({ ...actor, ...autoSpendPreference(actor) })) ??
      createInitialParty(id),
    quests: normalizeQuests(overrides.quests),
    battle: overrides.battle ? { ...overrides.battle, ...rewardGoldField(overrides.battle) } : undefined,
    activityLog: overrides.activityLog ?? ['New expedition started.'],
    source: overrides.source ?? { type: 'new-game' },
  };
}

export function normalizeGameState(state: StoredGameState): GameState {
  const dungeonLevel = state.dungeonLevel ?? 1;
  const mazeMaxRooms = state.mazeMaxRooms ?? 32;
  const storedActiveFloor = state.floors?.find((floor) => floor.level === dungeonLevel);
  const activeMaze = normalizeMaze(state.maze ?? storedActiveFloor?.maze, state.maze?.rows ?? storedActiveFloor?.maze?.rows ?? 9, state.maze?.columns ?? storedActiveFloor?.maze?.columns ?? 13);
  const monsterTags = normalizeMonsterTags(state.monsterTags ?? storedActiveFloor?.monsterTags, dungeonLevel);
  const base = createNewGameState({
    id: state.id,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    dungeonLevel,
    wave: state.wave,
    mazeMaxRooms,
    monsterTags,
    mazeTexture: state.mazeTexture,
    autoThrottleMs: state.autoThrottleMs,
    randomBattles: state.randomBattles,
    inventoryPolicy: state.inventoryPolicy,
    ...(typeof state.automationPaused === 'boolean' ? { automationPaused: state.automationPaused } : {}),
    autopilot: state.autopilot,
    townReturnMode: normalizeTownReturnMode(state.townReturnMode),
    mode: state.mode,
    facing: state.facing,
    maze: activeMaze,
    floors: state.floors,
    chests: state.chests,
    inventory: state.inventory,
    stash: state.stash,
    quests: normalizeQuests(state.quests),
    activityLog: state.activityLog,
    source: state.source,
  });

  return {
    ...base,
    party: base.party.map((defaults, index) => normalizeActor(defaults, state.party?.find((actor) => actor.role === defaults.role) ?? state.party?.[index])),
    battle: state.battle && state.battle.status !== 'won'
      ? {
          ...state.battle,
          ...rewardGoldField(state.battle),
          id: state.battle.id ?? crypto.randomUUID(),
          wave: state.battle.wave ?? 1,
          status: state.battle.status ?? 'active',
          round: state.battle.round ?? 1,
          log: state.battle.log ?? [],
          loot: state.battle.loot ?? [],
          enemies: (state.battle.enemies ?? []).map(normalizeEnemy),
          defeated: (state.battle.defeated ?? []).map(normalizeEnemy),
          origin: state.battle.origin
            ? { ...state.battle.origin, position: { ...state.battle.origin.position } }
            : { floor: dungeonLevel, roomId: roomAtPosition(base)?.id, position: { ...base.maze.active } },
        }
      : undefined,
  };
}

function normalizeTownReturnMode(mode: unknown): GameState['townReturnMode'] {
  return mode === 'manual' || mode === 'auto-play' || mode === 'waves' ? mode : undefined;
}

export function moveActive(game: GameState, direction: Direction, options: { triggerStairs?: boolean } = {}): GameState {
  const updatedAt = nowIso();
  const facingGame = game.facing === direction ? game : { ...game, facing: direction, updatedAt };

  if (!canMove(game.maze, direction)) {
    return facingGame;
  }

  const nextActive = movePosition(game.maze.active, direction);
  if (nextActive.row < 0 || nextActive.column < 0 || nextActive.row >= game.maze.rows || nextActive.column >= game.maze.columns
    || !mazeCellAt(game.maze, nextActive)) return facingGame;
  const visited = hasVisited(game.maze.visited, nextActive) ? game.maze.visited : [...game.maze.visited, nextActive];
  const currentMaze = revealMazeVisibility({ ...game.maze, active: nextActive, visited });
  const movedGame = updateQuestProgress({
    ...facingGame,
    updatedAt,
    maze: currentMaze,
    floors: replaceFloor(game.floors, game.dungeonLevel, game.mazeMaxRooms, currentMaze, game.monsterTags),
    activityLog: trimLog([`Moved ${direction}.`, ...game.activityLog]),
  });

  if (options.triggerStairs === false) return movedGame;

  if (samePosition(nextActive, game.maze.end)) {
    return enterFloor(movedGame, currentMaze, game.dungeonLevel + 1, 'down');
  }

  if (game.dungeonLevel > 1 && samePosition(nextActive, game.maze.start)) {
    return enterFloor(movedGame, currentMaze, game.dungeonLevel - 1, 'up');
  }

  if (game.dungeonLevel === 1 && samePosition(nextActive, game.maze.start)) {
    return enterTownFromStartStairs(movedGame, currentMaze);
  }

  return movedGame;
}

export function descendFloor(game: GameState, rng: Rng = defaultRng): GameState {
  if (game.mode === 'town' || game.battle || game.party.every((actor) => actor.hp <= 0)
    || !samePosition(game.maze.active, game.maze.end)) return game;
  const ready = updateQuestProgress(game);
  if (ready.quests.some((quest) => quest.floor === ready.dungeonLevel && quest.status !== 'claimed')
    || ready.chests.some((chest) => chest.level === ready.dungeonLevel && !chest.opened)) return ready;
  return enterFloor(ready, ready.maze, ready.dungeonLevel + 1, 'down', rng);
}

export function setGameMode(game: GameState, mode: GameMode): GameState {
  if (game.mode === mode) {
    return game;
  }

  return {
    ...game,
    mode,
    updatedAt: nowIso(),
    activityLog: trimLog([`Mode changed to ${mode}.`, ...game.activityLog]),
  };
}

export function setRandomBattles(game: GameState, randomBattles: boolean): GameState {
  if (game.randomBattles === randomBattles) {
    return game;
  }

  return {
    ...game,
    randomBattles,
    updatedAt: nowIso(),
    activityLog: trimLog([`Random encounters ${randomBattles ? 'enabled' : 'disabled'}.`, ...game.activityLog]),
  };
}

export function setMazeTexture(game: GameState, mazeTexture: MazeTextureId): GameState {
  const normalized = normalizeMazeTexture(mazeTexture);
  if (game.mazeTexture === normalized) {
    return game;
  }

  return {
    ...game,
    mazeTexture: normalized,
    updatedAt: nowIso(),
  };
}

export function setAutoThrottle(game: GameState, autoThrottleMs: number): GameState {
  const normalized = normalizeAutoThrottleMs(autoThrottleMs);
  if (game.autoThrottleMs === normalized) {
    return game;
  }

  return {
    ...game,
    autoThrottleMs: normalized,
    updatedAt: nowIso(),
  };
}

export function setActorAutoBattle(game: GameState, actorId: string, autoBattle: boolean): GameState {
  const actor = game.party.find((item) => item.id === actorId);
  if (!actor || actor.autoBattle === autoBattle) {
    return game;
  }

  return {
    ...game,
    updatedAt: nowIso(),
    party: game.party.map((item) => (item.id === actorId ? { ...item, autoBattle } : item)),
    activityLog: trimLog([`${actor.displayName} auto battle ${autoBattle ? 'enabled' : 'disabled'}.`, ...game.activityLog]),
  };
}

export function setPartyAutoBattle(game: GameState, autoBattle: boolean): GameState {
  if (game.party.every((actor) => actor.autoBattle === autoBattle)) {
    return game;
  }

  return {
    ...game,
    updatedAt: nowIso(),
    party: game.party.map((actor) => ({ ...actor, autoBattle })),
    activityLog: trimLog([`Party auto battle ${autoBattle ? 'enabled' : 'disabled'}.`, ...game.activityLog]),
  };
}

export function summarizeGame(game: GameState) {
  return {
    dungeonLevel: game.dungeonLevel,
    partyLevels: Object.fromEntries(game.party.map((actor) => [actor.role, actor.level])) as Record<HeroRole, number>,
  };
}

function normalizeQuests(quests: Partial<QuestState>[] | undefined): QuestState[] {
  const byId = new Map<string, Partial<QuestState> & Pick<QuestState, 'id'>>();
  const statusRank = (quest: Partial<QuestState>) => quest.status === 'claimed' ? 2 : quest.status === 'complete' ? 1 : 0;
  for (const quest of quests ?? []) {
    if (typeof quest.id !== 'string' || !quest.id) continue;
    const previous = byId.get(quest.id);
    if (!previous || statusRank(quest) > statusRank(previous)
      || (statusRank(quest) === statusRank(previous) && (quest.task?.progress ?? 0) > (previous.task?.progress ?? 0))) {
      byId.set(quest.id, { ...quest, id: quest.id });
    }
  }
  return [...byId.values()]
    .map((quest) => {
      const required = Math.max(1, quest.task?.required ?? 1);
      const progress = Math.min(required, Math.max(0, quest.task?.progress ?? 0));
      const item = quest.task?.item;
      // Dropping a malformed collectible spec would enable legacy chest-only completion.
      if (item !== undefined && (!item || typeof item !== 'object' || Array.isArray(item)
        || [item.baseId, item.displayName, item.token].some((value) => typeof value !== 'string' || !value.trim()))) {
        throw new Error('Invalid quest item specification');
      }

      return {
        id: quest.id,
        source: quest.source ?? 'guild',
        floor: quest.floor ?? 1,
        originRoomId: quest.originRoomId ?? 'unknown-origin',
        targetRoomId: quest.targetRoomId ?? 'unknown-target',
        targetRoomName: quest.targetRoomName ?? 'Unknown Room',
        targetRoomKind: quest.targetRoomKind ?? 'safe',
        title: quest.title ?? 'Unmarked Quest',
        description: quest.description ?? '',
        task: {
          objective: quest.task?.objective ?? 'scout',
          noun: quest.task?.noun ?? 'room',
          required,
          progress,
          monsterTags: quest.task?.monsterTags ? [...quest.task.monsterTags] : undefined,
          ...(item === undefined ? {} : { item: { baseId: item.baseId, displayName: item.displayName, token: item.token } }),
        },
        reward: {
          gold: Math.max(0, quest.reward?.gold ?? 0),
        },
        status: quest.status ?? (progress >= required ? 'complete' : 'active'),
        acceptedAt: quest.acceptedAt ?? nowIso(),
        completedAt: quest.completedAt,
        claimedAt: quest.claimedAt,
      };
    });
}

function autoSpendPreference(actor: StoredActor) {
  return { autoSpendPoints: typeof actor.autoSpendPoints === 'boolean' ? actor.autoSpendPoints : true };
}

function rewardGoldField(battle: StoredBattle) {
  const value = battle.rewardGold;
  return { rewardGold: typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined };
}

function normalizeActor(defaults: ActorState, actor: StoredActor | undefined): ActorState {
  return {
    ...defaults,
    ...actor,
    ...autoSpendPreference(actor ?? {}),
    role: defaults.role,
    displayName: actor?.displayName ?? defaults.displayName,
    gcdUntil: actor?.gcdUntil,
    equipment: {
      ...defaults.equipment,
      ...actor?.equipment,
    },
    attributes: {
      ...defaults.attributes,
      ...actor?.attributes,
    },
    combat: {
      ...defaults.combat,
      ...actor?.combat,
    },
    skills: mergeSkills(defaults.skills, actor?.skills),
  };
}

function normalizeEnemy(enemy: Partial<EnemyState>): EnemyState {
  return {
    id: enemy.id ?? crypto.randomUUID(),
    monsterId: enemy.monsterId,
    displayName: enemy.displayName ?? 'Enemy',
    token: enemy.token ?? '(??)',
    tags: normalizeMonsterTags(enemy.tags, enemy.level ?? 1),
    level: enemy.level ?? 1,
    hp: enemy.hp ?? 1,
    maxHp: enemy.maxHp ?? 1,
    mp: enemy.mp ?? 0,
    maxMp: enemy.maxMp ?? 0,
    gcdUntil: enemy.gcdUntil,
    attributes: {
      strength: 8,
      vitality: 8,
      intellect: 0,
      available: 0,
      ...enemy.attributes,
    },
    combat: {
      baseDamage: 6,
      scaleWith: 'strength',
      ...enemy.combat,
    },
    skills: mergeSkills([{ id: 'attack', cooldown: 0 }], enemy.skills),
  };
}

function mergeSkills(defaults: SkillState[], current: SkillState[] | undefined) {
  return defaults.map((defaultSkill) => {
    const skill = {
      ...defaultSkill,
      ...current?.find((item) => item.id === defaultSkill.id),
    };

    return {
      ...skill,
      cooldown: 0,
    };
  });
}

function hasVisited(visited: GridPosition[], position: GridPosition) {
  return visited.some((item) => samePosition(item, position));
}

function trimLog(entries: string[]) {
  return entries.slice(0, 12);
}

function enterFloor(game: GameState, currentMaze: GameState['maze'], targetLevel: number, direction: 'down' | 'up', rng: Rng = defaultRng): GameState {
  const storedCurrentFloors = replaceFloor(game.floors, game.dungeonLevel, game.mazeMaxRooms, currentMaze, game.monsterTags);
  const existingTarget = storedCurrentFloors.find((floor) => floor.level === targetLevel);
  const targetMazeMaxRooms = existingTarget?.mazeMaxRooms ?? nextMazeMaxRooms(game.mazeMaxRooms, direction);
  const targetMaze = enterMaze(existingTarget?.maze ?? nextLevelMaze(game.id, targetLevel, rng), direction === 'down' ? 'start' : 'end');
  const targetMonsterTags = normalizeMonsterTags(existingTarget?.monsterTags, targetLevel);
  const verb = direction === 'down' ? 'Descended' : 'Returned';
  const chests = game.chests.some((chest) => chest.level === targetLevel) ? game.chests : [...game.chests, ...generateChestsForMaze(targetLevel, targetMaze)];

  return updateQuestProgress({
    ...game,
    updatedAt: nowIso(),
    dungeonLevel: targetLevel,
    mazeMaxRooms: targetMazeMaxRooms,
    monsterTags: targetMonsterTags,
    maze: targetMaze,
    floors: replaceFloor(storedCurrentFloors, targetLevel, targetMazeMaxRooms, targetMaze, targetMonsterTags),
    chests,
    autopilot: normalizeAutopilot(game.autopilot, targetLevel),
    activityLog: trimLog([`${verb} to dungeon level ${targetLevel}.`, ...game.activityLog]),
  });
}

function enterTownFromStartStairs(game: GameState, currentMaze: GameState['maze']): GameState {
  return {
    ...game,
    mode: 'town',
    townReturnMode: game.mode === 'auto-play' || game.mode === 'waves' ? game.mode : 'manual',
    battle: undefined,
    updatedAt: nowIso(),
    maze: currentMaze,
    floors: replaceFloor(game.floors, game.dungeonLevel, game.mazeMaxRooms, currentMaze, game.monsterTags),
    activityLog: trimLog(['Returned to town.', ...game.activityLog]),
  };
}

function enterMaze(maze: GameState['maze'], entry: 'start' | 'end') {
  const active = entry === 'start' ? maze.start : maze.end;
  const visited = hasVisited(maze.visited, active) ? maze.visited : [...maze.visited, active];
  return revealMazeVisibility({
    ...maze,
    active,
    visited,
  });
}

function replaceFloor(floors: MazeFloorState[], level: number, mazeMaxRooms: number, maze: GameState['maze'], monsterTags: MonsterCategory[] = monsterTagsForFloor(level)) {
  const next = floors.filter((floor) => floor.level !== level);
  next.push({ level, mazeMaxRooms, monsterTags: normalizeMonsterTags(monsterTags, level), maze });
  return next.sort((a, b) => a.level - b.level);
}

function normalizeFloors(floors: Partial<MazeFloorState>[] | undefined, activeLevel: number, activeMazeMaxRooms: number, activeMaze: GameState['maze'], activeMonsterTags: MonsterCategory[]) {
  const byLevel = new Map<number, MazeFloorState>();

  for (const floor of floors ?? []) {
    const level = floor.level ?? 1;
    const mazeMaxRooms = floor.mazeMaxRooms ?? (level === activeLevel ? activeMazeMaxRooms : 32);
    const maze = normalizeMaze(floor.maze, floor.maze?.rows ?? floorRows(mazeMaxRooms), floor.maze?.columns ?? floorRows(mazeMaxRooms) + 4);
    byLevel.set(level, { level, mazeMaxRooms, monsterTags: normalizeMonsterTags(floor.monsterTags, level), maze });
  }

  byLevel.set(activeLevel, { level: activeLevel, mazeMaxRooms: activeMazeMaxRooms, monsterTags: activeMonsterTags, maze: activeMaze });
  return Array.from(byLevel.values()).sort((a, b) => a.level - b.level);
}

function normalizeMaze(maze: Partial<GameState['maze']> | undefined, fallbackRows: number, fallbackColumns: number): GameState['maze'] {
  if (maze?.layout && (!maze.cells || maze.cells.length === 0)) throw new Error('Stored versioned floor is missing its cells');
  if (!maze?.cells || maze.cells.length === 0) {
    const generated = generateStructuredMaze(fallbackRows, fallbackColumns);
    return revealMazeVisibility({
      ...generated,
      active: maze?.active ?? generated.active,
      visited: maze?.visited ?? generated.visited,
      visibility: maze?.visibility ?? generated.visibility,
      layout: normalizeMazeLayout(maze?.layout ?? generated.layout),
    });
  }

  return revealMazeVisibility({
    rows: maze.rows ?? fallbackRows,
    columns: maze.columns ?? fallbackColumns,
    start: maze.start ?? { row: 0, column: 0 },
    end: maze.end ?? { row: (maze.rows ?? fallbackRows) - 1, column: (maze.columns ?? fallbackColumns) - 1 },
    active: maze.active ?? maze.start ?? { row: 0, column: 0 },
    visited: maze.visited ?? [maze.start ?? { row: 0, column: 0 }],
    visibility: maze.visibility,
    layout: normalizeMazeLayout(maze.layout),
    cells: maze.cells.map((cell) => ({ row: cell.row, column: cell.column, links: [...(cell.links ?? [])] })),
  });
}

function normalizeMazeLayout(layout: MazeLayoutState | undefined): MazeLayoutState | undefined {
  if (!layout) {
    return undefined;
  }

  if (layout.version && !['structured-v1', 'structured-v2', 'structured-v3'].includes(layout.version)) {
    throw new Error('Unsupported maze layout version');
  }
  const assembly = normalizeModuleMetadata(layout);

  return {
    version: layout.version ?? 'structured-v1',
    ...(assembly ? { assembly } : {}),
    rooms: (layout.rooms ?? []).map((room) => ({
      ...room,
      tags: room.tags ?? roomTagsForKind(room.kind),
    })),
    mainPath: layout.mainPath ?? [],
    zones: layout.zones ?? [],
    connections: layout.connections?.map((connection) => ({
      ...connection,
      fromDoor: { ...connection.fromDoor },
      toDoor: { ...connection.toDoor },
      path: connection.path.map((position) => ({ ...position })),
    })),
  };
}

function nextMazeMaxRooms(currentMazeMaxRooms: number, direction: 'down' | 'up') {
  if (direction === 'up') {
    return Math.max(32, Math.floor(currentMazeMaxRooms / 1.3));
  }

  return Math.ceil(currentMazeMaxRooms * 1.3);
}

function nextLevelMaze(worldId: string, level: number, rng: Rng) {
  const seed = Math.min(0xffffffff, Math.floor(rng() * 0x100000000));
  return generateModuleMaze(createModuleRecipe(worldId, level, seed));
}

function floorRows(mazeMaxRooms: number) {
  const rows = Math.max(9, Math.ceil(Math.sqrt(mazeMaxRooms)));
  return rows;
}
