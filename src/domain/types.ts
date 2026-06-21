export type Direction = 'north' | 'east' | 'south' | 'west';

export type GameMode = 'manual' | 'auto-play' | 'waves' | 'battle' | 'town';

export type HeroRole = 'warrior' | 'mage' | 'healer';

export type MazeTextureId = 'procedural' | 'dark-flagstone' | 'cobble-small' | 'slab-rough' | 'block-mixed' | 'brick-worn';

export type SkillId =
  | 'attack'
  | 'slash'
  | 'cleave'
  | 'slam'
  | 'smite'
  | 'heal'
  | 'groupHeal'
  | 'resurrect'
  | 'wand'
  | 'arcaneBlast'
  | 'magicMissiles'
  | 'arcaneWave'
  | 'teleport';

export type CombatScale = 'strength' | 'intellect';

export type EquipmentSlot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'ring' | 'amulet';

export type ItemRarity = 'common' | 'magic' | 'rare' | 'legendary';

export type ItemCategory = 'equipment' | 'consumable' | 'currency';

export type ConsumableEffect = 'heal' | 'mana' | 'townPortal';

export type VendorId = 'blacksmith' | 'alchemist';

export interface GridPosition {
  row: number;
  column: number;
}

export interface MazeState {
  rows: number;
  columns: number;
  start: GridPosition;
  end: GridPosition;
  active: GridPosition;
  visited: GridPosition[];
  cells: MazeCellState[];
}

export interface MazeFloorState {
  level: number;
  mazeMaxRooms: number;
  maze: MazeState;
}

export interface MazeCellState extends GridPosition {
  links: Direction[];
}

export interface ActorAttributes {
  strength: number;
  vitality: number;
  intellect: number;
  available: number;
}

export interface CombatStats {
  baseDamage: number;
  scaleWith: CombatScale;
}

export interface SkillState {
  id: SkillId;
  cooldown: number;
  cooldownUntil?: number;
  rechargeUntil?: number;
  charges?: number;
  maxCharges?: number;
}

export interface ItemStats {
  strength?: number;
  vitality?: number;
  intellect?: number;
  maxHp?: number;
  maxMp?: number;
  baseDamage?: number;
}

export interface ItemAffix {
  id: string;
  name: string;
  stats: ItemStats;
}

export interface LegendaryPower {
  id: string;
  name: string;
  description: string;
  stats?: ItemStats;
}

export interface ItemInstance {
  id: string;
  baseId: string;
  displayName: string;
  token: string;
  category: ItemCategory;
  rarity: ItemRarity;
  itemLevel: number;
  value: number;
  slot?: EquipmentSlot;
  stats?: ItemStats;
  affixes?: ItemAffix[];
  legendaryPower?: LegendaryPower;
  consumableEffect?: ConsumableEffect;
  consumableAmount?: number;
  quantity?: number;
}

export type EquipmentState = Partial<Record<EquipmentSlot, string>>;

export interface ActorState {
  id: string;
  role: HeroRole;
  displayName: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gold: number;
  autoBattle: boolean;
  gcdUntil?: number;
  equipment: EquipmentState;
  attributes: ActorAttributes;
  combat: CombatStats;
  skills: SkillState[];
}

export interface EnemyState {
  id: string;
  displayName: string;
  token: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gcdUntil?: number;
  attributes: ActorAttributes;
  combat: CombatStats;
  skills: SkillState[];
}

export interface BattleState {
  id: string;
  wave: number;
  status: 'active' | 'won' | 'lost';
  returnMode?: Exclude<GameMode, 'battle'>;
  enemies: EnemyState[];
  round: number;
  log: string[];
  loot?: ItemInstance[];
}

export interface InventoryState {
  capacity: number;
  gold: number;
  items: ItemInstance[];
}

export interface ChestState {
  id: string;
  level: number;
  position: GridPosition;
  opened: boolean;
  loot?: ItemInstance[];
}

export interface GameState {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  dungeonLevel: number;
  wave: number;
  mazeMaxRooms: number;
  mazeTexture: MazeTextureId;
  autoThrottleMs: number;
  randomBattles: boolean;
  mode: GameMode;
  facing: Direction;
  maze: MazeState;
  floors: MazeFloorState[];
  chests: ChestState[];
  inventory: InventoryState;
  party: ActorState[];
  battle?: BattleState;
  activityLog: string[];
  source?: {
    type: 'new-game' | 'legacy-local-storage';
    importedSlot?: string;
    importedAt?: string;
  };
}

export type SaveKind = 'auto' | 'manual' | 'imported';

export interface SaveSlot {
  slotId: string;
  label: string;
  kind: SaveKind;
  createdAt: string;
  updatedAt: string;
  game: GameState;
}

export interface SaveSummary {
  slotId: string;
  label: string;
  kind: SaveKind;
  updatedAt: string;
  dungeonLevel: number;
  partyLevels: Record<HeroRole, number>;
}
