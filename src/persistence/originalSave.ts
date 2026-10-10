import type { ActorState, GameState, HeroRole } from '../domain/types';
import { convertOriginalMaze } from './originalMaze';
import { boolean, integer, number, record } from './originalSaveValidation';

// Reconstruct unsaved level bonuses from legacy-final's hero classes / ActorAttributes.
const growth: Record<HeroRole, { hp: number; mp: number; strength: number; intellect: number; damageEvery: number; damage: number }> = {
  warrior: { hp: 20, mp: 0, strength: 3, intellect: 0, damageEvery: 5, damage: 2 },
  mage: { hp: 5, mp: 3, strength: 0, intellect: 2, damageEvery: 10, damage: 3 },
  healer: { hp: 10, mp: 1, strength: 0, intellect: 3, damageEvery: 1, damage: 0 },
};

function convertActor(value: unknown, role: HeroRole) {
  const source = record(value, role);
  const n = (field: string) => number(source[field], `${role}.${field}`);
  const level = integer(source.level, `${role}.level`, 1, 10_000);
  const bonus = growth[role];
  const levels = level - 1;
  const strength = n('strength') + levels * bonus.strength;
  const intellect = n('intellect') + levels * bonus.intellect;
  const vitality = n('vitality');
  const maxHp = n('baseHp') + levels * bonus.hp + vitality * 2;
  const maxMp = n('baseMp') + levels * bonus.mp + intellect * 2;
  if (maxHp <= 0) throw new Error(`${role}.baseHp: maximum health must be positive`);
  number(source.pointsPerLevel, `${role}.pointsPerLevel`);
  return {
    level, xp: n('xp'), hp: number(source.hp, `${role}.hp`, 0, maxHp), maxHp,
    mp: number(source.mp, `${role}.mp`, 0, maxMp), maxMp, gold: n('gold'),
    autoBattle: boolean(source.autoBattle, `${role}.autoBattle`),
    attributes: { strength, intellect, vitality, available: n('points') },
    combat: { baseDamage: n('baseDamage') + Math.floor(level / bonus.damageEvery) * bonus.damage, scaleWith: role === 'warrior' ? 'strength' : 'intellect' } as ActorState['combat'],
  };
}

export function convertOriginalSave(slot: string, value: unknown, createGame: (overrides: Partial<GameState>) => GameState): GameState {
  try {
    const source = record(value, 'save');
    const dungeonLevel = integer(source.level, 'level', 1, 10_000);
    const mazeMaxRooms = integer(source.mazeMaxRooms, 'mazeMaxRooms', 1, 1_000_000_000);
    const randomBattles = boolean(source.randomBattles, 'randomBattles');
    const maze = convertOriginalMaze(source.maze);
    const actors = { warrior: convertActor(source.warrior, 'warrior'), mage: convertActor(source.mage, 'mage'), healer: convertActor(source.healer, 'healer') };
    // Spawner credits every living actor the same reward. max is a conservative shared-wallet
    // mapping when deaths caused unequal balances; summing would duplicate shared rewards.
    const gold = Math.max(...Object.values(actors).map((actor) => actor.gold));
    const base = createGame({
      dungeonLevel, mazeMaxRooms, randomBattles, maze,
      inventory: { capacity: 36, gold, items: [] },
      activityLog: [`Imported original save ${slot}.`],
      source: { type: 'legacy-local-storage', importedSlot: slot, importedAt: new Date().toISOString() },
    });
    return {
      ...base,
      party: base.party.map((actor) => ({
        ...actor, ...actors[actor.role],
        skills: actor.skills.map((skill) => actor.role === 'warrior' && actors.warrior.level >= 25 && (skill.id === 'cleave' || skill.id === 'slam')
          ? { ...skill, charges: skill.charges! + 1, maxCharges: skill.maxCharges! + 1 } : skill),
      })),
    };
  } catch (error) {
    throw new Error(`Original save ${JSON.stringify(slot.slice(0, 160))}: ${error instanceof Error ? error.message : 'invalid record'}`);
  }
}
