import type { EnemyState, SkillState } from '../types';
import { roll, sample, type Rng } from './rng';

const ENEMIES = [
  { name: 'Spider', token: '🕷️' },
  { name: 'Bat', token: '🦇' },
  { name: 'Scorpion', token: '🦂' },
  { name: 'Skull', token: '💀' },
  { name: 'Ghost', token: '👻' },
  { name: 'Slime', token: '🐽' },
  { name: 'Lizard', token: '🦎' },
  { name: 'Snake', token: '🐍' },
  { name: 'Hornet', token: '🐝' },
  { name: 'Wyrm', token: '🐉' },
];

export function spawnEnemies(dungeonLevel: number, rng: Rng): EnemyState[] {
  const count = spawnCount(rng);
  return Array.from({ length: count }, (_, index) => createEnemy(index, mobLevel(dungeonLevel, rng), rng));
}

function createEnemy(index: number, level: number, rng: Rng): EnemyState {
  const enemy = sample(ENEMIES, rng);
  const vitality = 8 + level * 2;
  const strength = 8 + level * 3;
  const maxHp = 24 + vitality * 2 + level * 8;

  return {
    id: `enemy-${Date.now()}-${index}-${roll(9999, rng)}`,
    displayName: enemy.name,
    token: enemy.token,
    level,
    hp: maxHp,
    maxHp,
    mp: 0,
    maxMp: 0,
    attributes: {
      strength,
      vitality,
      intellect: 0,
      available: 0,
    },
    combat: {
      baseDamage: 6 + level,
      scaleWith: 'strength',
    },
    skills: [{ id: 'attack', cooldown: 0 } satisfies SkillState],
  };
}

function spawnCount(rng: Rng) {
  const d = roll(30, rng);
  let max = 1;

  if (d > 27) max = 10;
  else if (d > 23) max = 8;
  else if (d > 17) max = 6;
  else if (d > 13) max = 5;
  else if (d > 11) max = 4;
  else if (d > 9) max = 3;
  else if (d > 7) max = 2;

  return roll(max, rng);
}

function mobLevel(dungeonLevel: number, rng: Rng) {
  const min = Math.max(1, dungeonLevel - 2);
  const max = dungeonLevel + 3;

  if (roll(20, rng) > 13) {
    return Math.max(min, roll(max, rng));
  }

  return dungeonLevel;
}
