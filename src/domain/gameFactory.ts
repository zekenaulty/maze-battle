import type { ActorState, BattleState, Direction, EnemyState, GameMode, GameState, GridPosition, HeroRole, MazeFloorState, MazeLayoutState, MazeTextureId, MonsterCategory, QuestState, SkillState } from './types';
import { generateStructuredMaze, roomTagsForKind } from './maze/structuredGenerate';
import { samePosition } from './maze/key';
import { canMove, movePosition } from './maze/movement';
import { generateChestsForMaze, normalizeChests } from './items/chests';
import { createInitialInventory, createInitialStash, normalizeInventory, normalizeStash } from './items/inventory';
import { normalizeAutoThrottleMs } from './automation/throttle';
import { normalizeMazeTexture } from './maze/textureOptions';
import { revealMazeVisibility } from './maze/visibility';
import { syncGuildQuests } from './quests/quests';
import { monsterTagsForFloor, normalizeMonsterTags } from './combat/monsters';

const HERO_ORDER: HeroRole[] = ['warrior', 'mage', 'healer'];

const HEROES: Record<HeroRole, Omit<ActorState, 'id'>> = {
  warrior: {
    role: 'warrior',
    displayName: 'Vor',
    level: 1,
    xp: 0,
    hp: 110,
    maxHp: 110,
    mp: 0,
    maxMp: 0,
    gold: 0,
    autoBattle: true,
    equipment: {},
    attributes: {
      strength: 40,
      vitality: 30,
      intellect: 0,
      available: 0,
    },
    combat: {
      baseDamage: 8,
      scaleWith: 'strength',
    },
    skills: makeSkills(['slash', 'cleave', 'slam']),
  },
  mage: {
    role: 'mage',
    displayName: 'Zyth',
    level: 1,
    xp: 0,
    hp: 50,
    maxHp: 50,
    mp: 130,
    maxMp: 130,
    gold: 0,
    autoBattle: true,
    equipment: {},
    attributes: {
      strength: 10,
      vitality: 15,
      intellect: 40,
      available: 0,
    },
    combat: {
      baseDamage: 7,
      scaleWith: 'intellect',
    },
    skills: makeSkills(['wand', 'arcaneBlast', 'magicMissiles', 'arcaneWave', 'teleport']),
  },
  healer: {
    role: 'healer',
    displayName: 'Ayla',
    level: 1,
    xp: 0,
    hp: 60,
    maxHp: 60,
    mp: 110,
    maxMp: 110,
    gold: 0,
    autoBattle: true,
    equipment: {},
    attributes: {
      strength: 10,
      vitality: 15,
      intellect: 40,
      available: 0,
    },
    combat: {
      baseDamage: 7,
      scaleWith: 'intellect',
    },
    skills: makeSkills(['smite', 'heal', 'groupHeal', 'resurrect']),
  },
};

const nowIso = () => new Date().toISOString();

type StoredGameState = Partial<Omit<GameState, 'battle' | 'floors' | 'party'>> & {
  battle?: Partial<Omit<BattleState, 'enemies'>> & { enemies?: Partial<EnemyState>[] };
  floors?: Partial<MazeFloorState>[];
  party?: Partial<ActorState>[];
  quests?: Partial<QuestState>[];
  monsterTags?: MonsterCategory[];
};

type GameStateOverrides = Partial<Omit<GameState, 'floors' | 'maze'>> & {
  floors?: Partial<MazeFloorState>[];
  maze?: Partial<GameState['maze']>;
};

export function createNewGameState(overrides: GameStateOverrides = {}): GameState {
  const now = nowIso();
  const id = overrides.id ?? crypto.randomUUID();
  const dungeonLevel = overrides.dungeonLevel ?? 1;
  const mazeMaxRooms = overrides.mazeMaxRooms ?? 32;
  const maze = normalizeMaze(overrides.maze, 9, 13);
  const monsterTags = normalizeMonsterTags(overrides.monsterTags, dungeonLevel);
  const floors = normalizeFloors(overrides.floors, dungeonLevel, mazeMaxRooms, maze, monsterTags);
  const inventory = normalizeInventory(overrides.inventory ?? createInitialInventory());
  const stash = normalizeStash(overrides.stash ?? createInitialStash());
  const chests = normalizeChests(overrides.chests, dungeonLevel, maze);

  return syncGuildQuests({
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
    mode: overrides.mode ?? 'manual',
    facing: overrides.facing ?? 'south',
    maze,
    floors,
    chests,
    inventory,
    stash,
    party:
      overrides.party ??
      HERO_ORDER.map((role) => ({
        id: `${id}-${role}`,
        ...copyHero(HEROES[role]),
      })),
    quests: normalizeQuests(overrides.quests),
    battle: overrides.battle,
    activityLog: overrides.activityLog ?? ['New expedition started.'],
    source: overrides.source ?? { type: 'new-game' },
  });
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
    party: HERO_ORDER.map((role, index) => normalizeActor(role, state.party?.find((actor) => actor.role === role) ?? state.party?.[index], base.id)),
    battle: state.battle && state.battle.status !== 'won'
      ? {
          ...state.battle,
          id: state.battle.id ?? crypto.randomUUID(),
          wave: state.battle.wave ?? 1,
          status: state.battle.status ?? 'active',
          round: state.battle.round ?? 1,
          log: state.battle.log ?? [],
          loot: state.battle.loot ?? [],
          enemies: (state.battle.enemies ?? []).map(normalizeEnemy),
        }
      : undefined,
  };
}

export function moveActive(game: GameState, direction: Direction): GameState {
  const updatedAt = nowIso();
  const facingGame = game.facing === direction ? game : { ...game, facing: direction, updatedAt };

  if (!canMove(game.maze, direction)) {
    return facingGame;
  }

  const nextActive = movePosition(game.maze.active, direction);
  const visited = hasVisited(game.maze.visited, nextActive) ? game.maze.visited : [...game.maze.visited, nextActive];
  const currentMaze = revealMazeVisibility({ ...game.maze, active: nextActive, visited });
  const movedGame = syncGuildQuests({
    ...facingGame,
    updatedAt,
    maze: currentMaze,
    floors: replaceFloor(game.floors, game.dungeonLevel, game.mazeMaxRooms, currentMaze, game.monsterTags),
    activityLog: trimLog([`Moved ${direction}.`, ...game.activityLog]),
  });

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

export function fromLegacyState(slotId: string, legacy: unknown): GameState {
  interface LegacyActorState {
    level?: number;
    xp?: number;
    hp?: number;
    mp?: number;
    gold?: number;
    autoBattle?: boolean;
    points?: number;
    strength?: number;
    vitality?: number;
    intellect?: number;
    baseDamage?: number;
  }

  const source = legacy as {
    level?: number;
    mazeMaxRooms?: number;
    randomBattles?: boolean;
    maze?: {
      rows?: number;
      columns?: number;
      start?: GridPosition;
      end?: GridPosition;
      active?: GridPosition;
      visited?: GridPosition[];
    };
    warrior?: LegacyActorState;
    mage?: LegacyActorState;
    healer?: LegacyActorState;
  };

  const base = createNewGameState({
    dungeonLevel: source.level ?? 1,
    mazeMaxRooms: source.mazeMaxRooms ?? 32,
    randomBattles: source.randomBattles ?? true,
    maze: normalizeMaze(source.maze, source.maze?.rows ?? 9, source.maze?.columns ?? 13),
    activityLog: [`Imported legacy save ${slotId}.`],
    source: {
      type: 'legacy-local-storage',
      importedSlot: slotId,
      importedAt: nowIso(),
    },
  });

  const legacyActors = {
    warrior: source.warrior,
    mage: source.mage,
    healer: source.healer,
  };

  return {
    ...base,
    party: base.party.map((actor) => {
      const legacyActor = legacyActors[actor.role];
      if (!legacyActor) {
        return actor;
      }

      return {
        ...actor,
        level: legacyActor.level ?? actor.level,
        xp: legacyActor.xp ?? actor.xp,
        hp: legacyActor.hp ?? actor.hp,
        mp: legacyActor.mp ?? actor.mp,
        gold: legacyActor.gold ?? actor.gold,
        autoBattle: legacyActor.autoBattle ?? actor.autoBattle,
        gcdUntil: undefined,
        attributes: {
          strength: legacyActor.strength ?? actor.attributes.strength,
          vitality: legacyActor.vitality ?? actor.attributes.vitality,
          intellect: legacyActor.intellect ?? actor.attributes.intellect,
          available: legacyActor.points ?? actor.attributes.available,
        },
        combat: {
          ...actor.combat,
          baseDamage: legacyActor.baseDamage ?? actor.combat.baseDamage,
        },
      };
    }),
  };
}

function makeSkills(ids: SkillState['id'][]): SkillState[] {
  return ids.map((id) => {
    if (id === 'cleave') {
      return { id, cooldown: 0, charges: 2, maxCharges: 2 };
    }

    if (id === 'slam') {
      return { id, cooldown: 0, charges: 1, maxCharges: 1 };
    }

    return { id, cooldown: 0 };
  });
}

function copyHero(hero: Omit<ActorState, 'id'>): Omit<ActorState, 'id'> {
  return {
    ...hero,
    equipment: { ...hero.equipment },
    attributes: { ...hero.attributes },
    combat: { ...hero.combat },
    skills: hero.skills.map((skill) => ({ ...skill })),
  };
}

function normalizeQuests(quests: Partial<QuestState>[] | undefined): QuestState[] {
  return (quests ?? [])
    .filter((quest): quest is Partial<QuestState> & Pick<QuestState, 'id'> => typeof quest.id === 'string' && quest.id.length > 0)
    .map((quest) => {
      const required = Math.max(1, quest.task?.required ?? 1);
      const progress = Math.min(required, Math.max(0, quest.task?.progress ?? 0));

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

function normalizeActor(role: HeroRole, actor: Partial<ActorState> | undefined, gameId: string): ActorState {
  const defaults = {
    id: `${gameId}-${role}`,
    ...copyHero(HEROES[role]),
  };

  return {
    ...defaults,
    ...actor,
    role,
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

function enterFloor(game: GameState, currentMaze: GameState['maze'], targetLevel: number, direction: 'down' | 'up'): GameState {
  const storedCurrentFloors = replaceFloor(game.floors, game.dungeonLevel, game.mazeMaxRooms, currentMaze, game.monsterTags);
  const existingTarget = storedCurrentFloors.find((floor) => floor.level === targetLevel);
  const targetMazeMaxRooms = existingTarget?.mazeMaxRooms ?? nextMazeMaxRooms(game.mazeMaxRooms, direction);
  const targetMaze = enterMaze(existingTarget?.maze ?? nextLevelMaze(targetMazeMaxRooms), direction === 'down' ? 'start' : 'end');
  const targetMonsterTags = normalizeMonsterTags(existingTarget?.monsterTags, targetLevel);
  const verb = direction === 'down' ? 'Descended' : 'Returned';
  const chests = game.chests.some((chest) => chest.level === targetLevel) ? game.chests : [...game.chests, ...generateChestsForMaze(targetLevel, targetMaze)];

  return syncGuildQuests({
    ...game,
    updatedAt: nowIso(),
    dungeonLevel: targetLevel,
    mazeMaxRooms: targetMazeMaxRooms,
    monsterTags: targetMonsterTags,
    maze: targetMaze,
    floors: replaceFloor(storedCurrentFloors, targetLevel, targetMazeMaxRooms, targetMaze, targetMonsterTags),
    chests,
    activityLog: trimLog([`${verb} to dungeon level ${targetLevel}.`, ...game.activityLog]),
  });
}

function enterTownFromStartStairs(game: GameState, currentMaze: GameState['maze']): GameState {
  return {
    ...game,
    mode: 'town',
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

  return {
    version: layout.version ?? 'structured-v1',
    rooms: (layout.rooms ?? []).map((room) => ({
      ...room,
      tags: room.tags ?? roomTagsForKind(room.kind),
    })),
    mainPath: layout.mainPath ?? [],
    zones: layout.zones ?? [],
  };
}

function nextMazeMaxRooms(currentMazeMaxRooms: number, direction: 'down' | 'up') {
  if (direction === 'up') {
    return Math.max(32, Math.floor(currentMazeMaxRooms / 1.3));
  }

  return Math.ceil(currentMazeMaxRooms * 1.3);
}

function nextLevelMaze(mazeMaxRooms: number) {
  const rows = floorRows(mazeMaxRooms);
  return generateStructuredMaze(rows, rows + 4);
}

function floorRows(mazeMaxRooms: number) {
  const rows = Math.max(9, Math.ceil(Math.sqrt(mazeMaxRooms)));
  return rows;
}
