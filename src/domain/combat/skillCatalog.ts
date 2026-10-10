import type { SkillId } from '../types';

export type SkillTarget = 'enemy' | 'allEnemies' | 'lowestAlly' | 'allAllies' | 'deadAlly' | 'none';

export interface SkillDefinition {
  id: SkillId;
  name: string;
  mpCost: number;
  cooldownMs: number;
  rechargeMs?: number;
  target: SkillTarget;
}

export const SKILLS: Record<SkillId, SkillDefinition> = {
  attack: { id: 'attack', name: 'Attack', mpCost: 0, cooldownMs: 1000, target: 'enemy' },
  slash: { id: 'slash', name: 'Slash', mpCost: 0, cooldownMs: 750, target: 'enemy' },
  cleave: { id: 'cleave', name: 'Cleave', mpCost: 0, cooldownMs: 500, rechargeMs: 2500, target: 'allEnemies' },
  slam: { id: 'slam', name: 'Slam', mpCost: 0, cooldownMs: 1000, rechargeMs: 3000, target: 'allEnemies' },
  smite: { id: 'smite', name: 'Smite', mpCost: 0, cooldownMs: 1000, target: 'enemy' },
  heal: { id: 'heal', name: 'Heal', mpCost: 4, cooldownMs: 1500, target: 'lowestAlly' },
  groupHeal: { id: 'groupHeal', name: 'Group Heal', mpCost: 8, cooldownMs: 6000, target: 'allAllies' },
  resurrect: { id: 'resurrect', name: 'Resurrect', mpCost: 20, cooldownMs: 2000, target: 'deadAlly' },
  wand: { id: 'wand', name: 'Wand', mpCost: 0, cooldownMs: 750, target: 'enemy' },
  arcaneBlast: { id: 'arcaneBlast', name: 'Arcane Blast', mpCost: 6, cooldownMs: 2000, target: 'enemy' },
  magicMissiles: { id: 'magicMissiles', name: 'Magic Missiles', mpCost: 8, cooldownMs: 4000, target: 'allEnemies' },
  arcaneWave: { id: 'arcaneWave', name: 'Arcane Wave', mpCost: 15, cooldownMs: 4000, target: 'allEnemies' },
  teleport: { id: 'teleport', name: 'Teleport', mpCost: 20, cooldownMs: 2000, target: 'none' },
};
