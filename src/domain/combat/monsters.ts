import type { MonsterCategory } from '../types';
import { sample, type Rng } from './rng';

export interface MonsterDefinition {
  id: string;
  displayName: string;
  token: string;
  tags: MonsterCategory[];
  minLevel: number;
  hpScale: number;
  damageScale: number;
}

const token = (codePoint: number) => String.fromCodePoint(codePoint);

export const MONSTERS: MonsterDefinition[] = [
  { id: 'cave-spider', displayName: 'Cave Spider', token: token(0x1f577), tags: ['vermin'], minLevel: 1, hpScale: 0.9, damageScale: 0.9 },
  { id: 'dusk-bat', displayName: 'Dusk Bat', token: token(0x1f987), tags: ['vermin', 'beast'], minLevel: 1, hpScale: 0.82, damageScale: 1.05 },
  { id: 'sting-scorpion', displayName: 'Sting Scorpion', token: token(0x1f982), tags: ['vermin'], minLevel: 2, hpScale: 1.08, damageScale: 1.05 },
  { id: 'ash-hornet', displayName: 'Ash Hornet', token: token(0x1f41d), tags: ['vermin'], minLevel: 3, hpScale: 0.9, damageScale: 1.2 },
  { id: 'cellar-rat', displayName: 'Cellar Rat', token: token(0x1f400), tags: ['vermin', 'beast'], minLevel: 1, hpScale: 0.84, damageScale: 0.92 },
  { id: 'dire-wolf', displayName: 'Dire Wolf', token: token(0x1f43a), tags: ['beast'], minLevel: 3, hpScale: 1.08, damageScale: 1.18 },
  { id: 'cave-bear', displayName: 'Cave Bear', token: token(0x1f43b), tags: ['beast'], minLevel: 5, hpScale: 1.32, damageScale: 1.1 },
  { id: 'bone-soldier', displayName: 'Bone Soldier', token: token(0x1f480), tags: ['undead'], minLevel: 2, hpScale: 1.0, damageScale: 1.05 },
  { id: 'wandering-ghost', displayName: 'Wandering Ghost', token: token(0x1f47b), tags: ['undead', 'arcane'], minLevel: 3, hpScale: 0.94, damageScale: 1.2 },
  { id: 'hungry-zombie', displayName: 'Hungry Zombie', token: token(0x1f9df), tags: ['undead'], minLevel: 4, hpScale: 1.25, damageScale: 1.0 },
  { id: 'crypt-wraith', displayName: 'Crypt Wraith', token: token(0x1f47b), tags: ['undead', 'arcane'], minLevel: 7, hpScale: 1.05, damageScale: 1.35 },
  { id: 'pit-snake', displayName: 'Pit Snake', token: token(0x1f40d), tags: ['reptile'], minLevel: 1, hpScale: 0.9, damageScale: 1.08 },
  { id: 'stone-lizard', displayName: 'Stone Lizard', token: token(0x1f98e), tags: ['reptile'], minLevel: 2, hpScale: 1.1, damageScale: 0.98 },
  { id: 'young-wyrm', displayName: 'Young Wyrm', token: token(0x1f409), tags: ['reptile', 'arcane'], minLevel: 6, hpScale: 1.22, damageScale: 1.22 },
  { id: 'blue-imp', displayName: 'Blue Imp', token: token(0x1f47f), tags: ['arcane'], minLevel: 4, hpScale: 0.92, damageScale: 1.28 },
  { id: 'watcher-eye', displayName: 'Watcher Eye', token: token(0x1f441), tags: ['arcane'], minLevel: 5, hpScale: 0.86, damageScale: 1.34 },
  { id: 'living-armor', displayName: 'Living Armor', token: token(0x1f6e1), tags: ['construct', 'arcane'], minLevel: 6, hpScale: 1.32, damageScale: 1.05 },
  { id: 'stone-golem', displayName: 'Stone Golem', token: token(0x1faa8), tags: ['construct'], minLevel: 8, hpScale: 1.55, damageScale: 1.08 },
  { id: 'green-slime', displayName: 'Green Slime', token: token(0x1f7e2), tags: ['ooze'], minLevel: 1, hpScale: 1.0, damageScale: 0.86 },
  { id: 'tar-ooze', displayName: 'Tar Ooze', token: token(0x26ab), tags: ['ooze'], minLevel: 4, hpScale: 1.18, damageScale: 0.96 },
];

const FLOOR_THEMES: MonsterCategory[][] = [
  ['vermin', 'beast'],
  ['undead', 'vermin'],
  ['reptile', 'beast'],
  ['arcane', 'undead'],
  ['construct', 'arcane'],
  ['ooze', 'reptile'],
];

export function monsterTagsForFloor(level: number): MonsterCategory[] {
  const index = Math.max(0, Math.floor(level) - 1) % FLOOR_THEMES.length;
  return [...FLOOR_THEMES[index]];
}

export function normalizeMonsterTags(tags: MonsterCategory[] | undefined, level: number): MonsterCategory[] {
  const allowed = new Set<MonsterCategory>(['vermin', 'beast', 'undead', 'reptile', 'arcane', 'construct', 'ooze']);
  const normalized = [...new Set((tags ?? []).filter((tag): tag is MonsterCategory => allowed.has(tag as MonsterCategory)))];
  return normalized.length > 0 ? normalized : monsterTagsForFloor(level);
}

export function pickMonster(level: number, tags: MonsterCategory[], rng: Rng): MonsterDefinition {
  const eligible = MONSTERS.filter((monster) => monster.minLevel <= level && monster.tags.some((tag) => tags.includes(tag)));
  const fallback = MONSTERS.filter((monster) => monster.minLevel <= level);
  return sample(eligible.length > 0 ? eligible : fallback, rng);
}
