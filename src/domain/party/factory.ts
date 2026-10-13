import type { ActorState, HeroRole, SkillState } from '../types';

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

export function createInitialParty(gameId: string): ActorState[] {
  return HERO_ORDER.map((role) => ({ id: `${gameId}-${role}`, ...copyHero(HEROES[role]) }));
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
    autoSpendPoints: typeof hero.autoSpendPoints === 'boolean' ? hero.autoSpendPoints : true,
    equipment: { ...hero.equipment },
    attributes: { ...hero.attributes },
    combat: { ...hero.combat },
    skills: hero.skills.map((skill) => ({ ...skill })),
  };
}
