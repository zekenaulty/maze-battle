import type { SaveSummary } from '../../../domain/types';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { readCanonical, type CanonicalQuery } from '../read';
import { executeCanonical } from '../transaction';
import type { CanonicalGameSnapshot, CanonicalRequest, Json } from '../types';
import { check, integer, request as validateRequest, validId } from '../validation';
import { encodeRoster, fields, timestamp } from '../roster/codec';
import { loadParty } from '../roster/projection';
import { validateKnowledge } from '../knowledge/evidence';
import { gameCheckpoint } from './checkpoint';
import { projectGameSnapshot } from './projection';
import { findPreparation } from './preparation';
import { MAX_MANUAL_SAVES, ManualSaveLimitError } from './saveLimits';

export { MAX_MANUAL_SAVES } from './saveLimits';
export const MAX_SAVE_LABEL = 80;
const CATALOG = 'manual-saves/catalog';
const saveKey = (id: string) => `manual-saves/snapshot/${id}`;
export type SaveCommand = { kind: 'create'; label: string } | { kind: 'load' | 'delete'; id: string };

function label(value: unknown): asserts value is string {
  check(typeof value === 'string' && value.length <= MAX_SAVE_LABEL && value.trim().length > 0
    && !/[\x00-\x1f\x7f]/.test(value), 'invalid save label');
}
function command(value: unknown): SaveCommand {
  const row = fields(value, 'kind', 'label id');
  if (row.kind === 'create') { fields(row, 'kind label'); label(row.label); }
  else { fields(row, 'kind id'); check((row.kind === 'load' || row.kind === 'delete') && validId(row.id), 'invalid save command'); }
  return row as SaveCommand;
}
async function catalog(pages: Pick<CanonicalQuery, 'get'>): Promise<string[]> {
  const record = await pages.get('execution', CATALOG);
  if (!record) return [];
  const row = fields(record.value, 'schema ids');
  check(record.indexes.length === 0 && row.schema === 1 && Array.isArray(row.ids) && row.ids.length <= MAX_MANUAL_SAVES
    && row.ids.every(validId) && new Set(row.ids).size === row.ids.length, 'invalid save catalog');
  return row.ids as string[];
}
async function saved(pages: Pick<CanonicalQuery, 'savedSnapshot'>, id: string): Promise<SaveSummary> {
  const { record, snapshot, source } = await pages.savedSnapshot(saveKey(id));
  const row = fields(record.value, 'schema sourceAttemptId snapshot summary');
  const summary = fields(row.summary, 'slotId label kind updatedAt dungeonLevel partyLevels');
  const checkpoint = gameCheckpoint(snapshot.checkpoint), original = command(source.input);
  check(row.schema === 1 && record.indexes.length === 0 && source.operation === 'save.command' && original.kind === 'create'
    && source.attemptId === id && summary.slotId === id && summary.kind === 'manual'
    && summary.label === original.label.trim() && summary.dungeonLevel === checkpoint.position.level, 'invalid save source');
  label(summary.label); timestamp(summary.updatedAt);
  const levels = fields(summary.partyLevels, 'warrior mage healer');
  check(Object.values(levels).every(level => integer(level, 1)), 'invalid saved party levels');
  return structuredClone(summary) as unknown as SaveSummary;
}

/** Current game's bounded named saves only; no old-format reader or auto-save copy. */
export async function listManualSaves(): Promise<SaveSummary[]> {
  return (await readCanonical(async pages => {
    const summaries: SaveSummary[] = [];
    for (const id of await catalog(pages)) summaries.push(await saved(pages, id));
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slotId.localeCompare(b.slotId));
  })).value;
}

/** Host-only facade. Exact retries resolve their receipt before inspecting current save/game state. */
export function executeSaveCommand(request: CanonicalRequest, options: { signal?: AbortSignal } = {}) {
  request = validateRequest(request);
  check(request.operation === 'save.command', 'invalid save operation');
  const input = command(request.input);
  return executeCanonical(request, async (tx): Promise<Json> => {
    const ids = await catalog(tx.pages);
    if (input.kind === 'create') {
      check(tx.head.quota.reservations === 0 && tx.head.quota.reservedBytes === 0
        && Object.keys(tx.head.allocations).length === 0, 'save creation requires no live allocations');
      check(!ids.includes(request.attemptId), 'duplicate manual save attempt');
      if (ids.length === MAX_MANUAL_SAVES) throw new ManualSaveLimitError();
      const checkpoint = gameCheckpoint(tx.head.checkpoint);
      await validateKnowledge(tx.pages, checkpoint.knowledge);
      const party = await loadParty(tx.pages);
      const partyLevels = Object.fromEntries(party.map(actor => [actor.role, actor.level]));
      check(Object.keys(partyLevels).sort().join(',') === 'healer,mage,warrior', 'incomplete saved party');
      const summary: SaveSummary = { slotId: request.attemptId, label: input.label.trim(), kind: 'manual',
        updatedAt: new Date().toISOString(), dungeonLevel: checkpoint.position.level, partyLevels: partyLevels as SaveSummary['partyLevels'] };
      const { generation, gameId, revision, roots, checkpoint: state } = tx.head;
      const snapshot: CanonicalGameSnapshot = { generation, gameId, revision, checkpoint: state, roots: { world: roots.world, knowledge: roots.knowledge } };
      const record = await tx.pages.set('execution', saveKey(summary.slotId), encodeRoster({ schema: 1, sourceAttemptId: request.attemptId, snapshot, summary }));
      await tx.pages.set('execution', CATALOG, { schema: 1, ids: [...ids, summary.slotId] });
      return { kind: 'create', summary: encodeRoster(summary), snapshotRecordId: record.id, snapshotWitness: canonicalJson(record) };
    }
    check(ids.includes(input.id), 'manual save not found');
    await saved(tx.pages, input.id);
    if (input.kind === 'load') await tx.restoreSnapshot(saveKey(input.id), async (pages, snapshot) => {
      const phase = await findPreparation(pages, gameCheckpoint(snapshot.checkpoint).position.level);
      check(phase === null || phase === 'ready', 'cannot restore an unfinished floor');
      await projectGameSnapshot(pages, snapshot);
    });
    else {
      await tx.pages.delete('execution', saveKey(input.id));
      await tx.pages.set('execution', CATALOG, { schema: 1, ids: ids.filter(id => id !== input.id) });
    }
    return { kind: input.kind, id: input.id };
  }, options);
}
