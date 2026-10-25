import { applySkill } from '../../../domain/combat/applySkill';
import { createCombatContext } from '../../../domain/combat/battleContext';
import { canUseSkill } from '../../../domain/combat/combatant';
import { defaultRng } from '../../../domain/combat/rng';
import { currentBattle } from '../combat/coherence';
import { requireWorldContent } from '../content/preparation';
import { validateKnowledge } from '../knowledge/evidence';
import { recordGameObservation, type ObservationReview } from '../knowledge/write';
import { loadRoster } from '../roster/projection';
import { saveRoster } from '../roster/write';
import type { CanonicalWork } from '../transaction';
import { check } from '../validation';
import { json, same } from '../world/records';
import { checkpointJson, gameCheckpoint, rosterContext } from './checkpoint';
import { teleportDestinations } from './teleportDestination';

/** Only the exploration facade admits this command. No target or randomness comes from its input. */
export async function commitTeleportCommand(tx: CanonicalWork, actorId: string, review?: ObservationReview) {
  const before = gameCheckpoint(tx.head.checkpoint), prior = await validateKnowledge(tx.pages, before.knowledge);
  const battle = await currentBattle(tx.pages, before);
  if (battle || before.mode === 'town') return { kind: 'teleport', outcome: 'unavailable' };
  const roster = await loadRoster(tx.pages, rosterContext(before)), now = Date.now();
  const actor = roster.state.party.find(value => value.id === actorId);
  if (!actor || !canUseSkill(actor, 'teleport', now)) return { kind: 'teleport', outcome: 'unavailable' };
  check(prior && same(prior.header.actor, before.position), 'observe the teleport origin before casting');
  await requireWorldContent(tx.pages, before.position.level);
  const destinations = await teleportDestinations(tx.pages, before.position);
  if (!destinations.length) return { kind: 'teleport', outcome: 'unavailable' };
  const roll = defaultRng(); check(Number.isFinite(roll) && roll >= 0 && roll < 1, 'invalid teleport random draw');
  const destination = destinations[Math.floor(roll * destinations.length)];
  const context = createCombatContext(roster.state, defaultRng, now);
  check(applySkill(context.party.find(value => value.id === actorId)!, 'teleport', context), 'teleport skill changed during casting');
  const next = { ...roster.state, party: context.party, updatedAt: new Date(now).toISOString(),
    activityLog: [`${actor.displayName} teleported.`, ...roster.state.activityLog].slice(0, 12) };
  await saveRoster(tx.pages, roster, next);
  const checkpoint = await recordGameObservation(tx, { ...before, position: destination,
    updatedAt: next.updatedAt, activityLog: next.activityLog }, review);
  tx.setCheckpoint(checkpointJson(checkpoint));
  return json({ kind: 'teleport', outcome: 'applied', moved: true, crossed: false, mode: checkpoint.mode,
    position: checkpoint.position, observation: { sequence: checkpoint.knowledge!.sequence, id: checkpoint.knowledge!.id } });
}
