import { defaultRng } from '../../../domain/combat/rng';
import { spawnEnemies } from '../../../domain/combat/spawn';
import { checkpointJson, gameCheckpoint, rosterContext } from '../game/checkpoint';
import { validateKnowledge } from '../knowledge/evidence';
import { loadRoster } from '../roster/projection';
import { saveRoster } from '../roster/write';
import { requireWorldContent } from '../content/preparation';
import type { CanonicalWork } from '../transaction';
import { check } from '../validation';
import { requireWorldAnchor } from '../world/residency';
import { currentBattle } from './coherence';
import { battleMode, type BattleMode } from './input';
import { saveBattle } from './records';
import type { CanonicalBattle } from './types';
import { recordGameplay } from '../telemetry/records';
import { battleFact } from '../telemetry/facts';

/** Host-only: explicit battle/waves intent or an actual committed movement encounter. */
export async function beginBattle(tx: CanonicalWork, returnMode: BattleMode): Promise<CanonicalBattle> {
  battleMode(returnMode);
  const checkpoint = gameCheckpoint(tx.head.checkpoint);
  check(!await currentBattle(tx.pages, checkpoint), 'battle already exists');
  check(checkpoint.mode !== 'town', 'cannot start battle in town');
  await validateKnowledge(tx.pages, checkpoint.knowledge);
  await requireWorldContent(tx.pages, checkpoint.position.level); await requireWorldAnchor(tx.pages, checkpoint.position);
  const before = await loadRoster(tx.pages, rosterContext(checkpoint));
  check(before.state.party.some(a => a.hp > 0), 'defeated party cannot start battle');
  if (returnMode !== 'manual' && !before.state.party.some(a => a.autoBattle))
    await saveRoster(tx.pages, before, { ...before.state, party: before.state.party.map(a => ({ ...a, autoBattle: true })) });
  const wave = returnMode === 'waves' ? checkpoint.wave + 1 : 1;
  const next: CanonicalBattle = { schema: 1, origin: checkpoint.position, stalledTicks: 0, paused: false,
    battle: { id: crypto.randomUUID(), wave, status: 'active', returnMode, round: 1, log: [`Battle ${wave} begins.`],
      enemies: spawnEnemies(checkpoint.position.level, defaultRng), defeated: [], loot: [], rewardGold: 0 } };
  await saveBattle(tx.pages, null, next);
  tx.setCheckpoint(checkpointJson({ ...checkpoint, mode: 'battle', updatedAt: new Date().toISOString() }));
  await recordGameplay(tx, battleFact('started', { kind: 'start' }, null, next));
  return next;
}
