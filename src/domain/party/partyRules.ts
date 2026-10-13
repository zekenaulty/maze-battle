import type { RosterState } from './roster';

export type SpendableAttribute = 'strength' | 'vitality' | 'intellect';
type PartyState = Pick<RosterState, 'party' | 'updatedAt'>;

export function spendAttribute<T extends PartyState>(game: T, actorId: string, attribute: SpendableAttribute): T {
  const actor = game.party.find(a => a.id === actorId);
  if (!actor || actor.attributes.available < 1 || !['strength', 'vitality', 'intellect'].includes(attribute)) return game;
  return {
    ...game,
    party: game.party.map(a => a.id !== actorId ? a : {
      ...a, attributes: { ...a.attributes, available: a.attributes.available - 1, [attribute]: a.attributes[attribute] + 1 },
      maxHp: a.maxHp + (attribute === 'vitality' ? 2 : 0), maxMp: a.maxMp + (attribute === 'intellect' ? 2 : 0),
    }),
    updatedAt: new Date().toISOString(),
  };
}

export function setAutoSpendPoints<T extends PartyState>(game: T, actorId: string, enabled: boolean): T {
  const actor = game.party.find(a => a.id === actorId);
  if (!actor || actor.autoSpendPoints === enabled) return game;
  return { ...game, party: game.party.map(a => a.id === actorId ? { ...a, autoSpendPoints: enabled } : a), updatedAt: new Date().toISOString() };
}

export function setActorAutoBattle<T extends PartyState & Pick<RosterState, 'activityLog'>>(game: T, actorId: string, autoBattle: boolean): T {
  const actor = game.party.find(a => a.id === actorId);
  if (!actor || actor.autoBattle === autoBattle) return game;
  return {
    ...game,
    party: game.party.map(a => a.id === actorId ? { ...a, autoBattle } : a),
    activityLog: [`${actor.displayName} auto battle ${autoBattle ? 'enabled' : 'disabled'}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}
