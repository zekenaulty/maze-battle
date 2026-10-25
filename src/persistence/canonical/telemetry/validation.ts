import { SKILLS } from '../../../domain/combat/skillCatalog';
import { fields, id, natural, number, timestamp } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import { position } from '../world/records';
import type { WorldPosition } from '../world/types';
import type { GameplayFact } from './types';

function resources(value: unknown) {
  const row = fields(value, 'hp mp level xp gold autoBattle');
  number(row.hp); number(row.mp); natural(row.level, 1); natural(row.xp); natural(row.gold);
  check(typeof row.autoBattle === 'boolean', 'invalid trace actor policy');
}
function pair(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  const row = fields(value, 'before after');
  natural(row.before); natural(row.after); check(row.before <= max && row.after <= max, 'invalid trace pair');
}
export function gameplayFact(value: unknown): GameplayFact {
  // Reserve room for the canonical record envelope, including maximum-length identity fields.
  jsonBytes(value, 3072);
  const row = fields(value, 'kind', 'event battleId origin trigger actorId skillId returnMode status round paused newlyDefeatedCount pendingGold pendingLootCount walletGoldDelta lootAwardCount actors command targetId walletGoldBefore walletGoldAfter');
  if (row.kind === 'reward') {
    fields(row, 'kind command targetId walletGoldBefore walletGoldAfter lootAwardCount');
    check(row.command === 'open-chest' || row.command === 'claim-quest', 'invalid reward trace command'); id(row.targetId);
    natural(row.walletGoldBefore); natural(row.walletGoldAfter); natural(row.lootAwardCount);
    check(row.walletGoldAfter >= row.walletGoldBefore && row.lootAwardCount <= 256
      && (row.command !== 'claim-quest' || row.lootAwardCount === 0), 'invalid reward trace payout');
  } else {
    fields(row, 'kind event battleId origin trigger actorId skillId returnMode status round paused newlyDefeatedCount pendingGold pendingLootCount walletGoldDelta lootAwardCount actors');
    check(row.kind === 'battle' && ['started', 'turn', 'won', 'lost', 'abandoned', 'closed-lost', 'paused', 'resumed', 'stalled'].includes(row.event as string), 'invalid battle trace event');
    id(row.battleId); const at = fields(row.origin, 'level cell'); fields(at.cell, 'spaceId row column'); position(row.origin as unknown as WorldPosition);
    check(['start', 'skill', 'round', 'tick', 'end', 'automation', 'actor-auto'].includes(row.trigger as string), 'invalid trace trigger');
    if (row.actorId !== null) id(row.actorId);
    check(row.skillId === null || typeof row.skillId === 'string' && Object.hasOwn(SKILLS, row.skillId), 'invalid trace skill');
    check(row.trigger === 'skill' ? row.actorId !== null && row.skillId !== null : row.skillId === null, 'invalid trace skill binding');
    check(row.trigger === 'skill' || row.trigger === 'actor-auto' || row.actorId === null, 'invalid trace actor binding');
    check(row.trigger !== 'actor-auto' || row.actorId !== null, 'missing trace actor');
    check(['manual', 'auto-play', 'waves'].includes(row.returnMode as string) && ['active', 'won', 'lost'].includes(row.status as string), 'invalid trace battle state');
    natural(row.round, 1); check(typeof row.paused === 'boolean', 'invalid trace pause');
    natural(row.newlyDefeatedCount); natural(row.lootAwardCount);
    check(row.newlyDefeatedCount <= 10 && row.lootAwardCount <= 20, 'unbounded trace battle rewards');
    pair(row.pendingGold); pair(row.pendingLootCount, 20); natural(row.walletGoldDelta);
    check(row.event === 'won' ? row.status === 'won' : row.walletGoldDelta === 0 && row.lootAwardCount === 0, 'invalid trace payout');
    check(row.event !== 'lost' && row.event !== 'closed-lost' || row.status === 'lost', 'invalid trace loss');
    const turn = ['turn', 'won', 'lost'].includes(row.event as string), closed = ['won', 'abandoned', 'closed-lost'].includes(row.event as string);
    check(turn || row.newlyDefeatedCount === 0, 'non-turn trace has defeats');
    check(!['started', 'turn', 'abandoned', 'resumed', 'stalled'].includes(row.event as string) || row.status === 'active', 'invalid active trace status');
    check(!closed || (row.pendingGold as { after: number }).after === 0 && (row.pendingLootCount as { after: number }).after === 0,
      'closed trace retains pending rewards');
    const triggers: Record<string, string[]> = { started: ['start'], turn: ['skill', 'round', 'tick'], won: ['skill', 'round', 'tick'],
      lost: ['skill', 'round', 'tick'], abandoned: ['end'], 'closed-lost': ['end'], paused: ['automation'], resumed: ['automation', 'actor-auto'], stalled: ['round', 'tick'] };
    check(triggers[row.event as string].includes(row.trigger as string), 'trace event trigger changed');
    check(!['paused', 'stalled', 'lost'].includes(row.event as string) || row.paused === true, 'trace pause missing');
    check(row.event !== 'resumed' || row.paused === false, 'trace resume is paused');
    check(Array.isArray(row.actors) && row.actors.length <= 3, 'unbounded trace actors');
    const ids = new Set<string>();
    for (const entry of row.actors) {
      const actor = fields(entry, 'id before after'); id(actor.id); check(!ids.has(actor.id), 'duplicate trace actor'); ids.add(actor.id);
      resources(actor.before); resources(actor.after);
    }
  }
  return structuredClone(value) as GameplayFact;
}
export function traceTime(value: unknown) { timestamp(value); return value; }
