import { openDB, type DBSchema } from 'idb';
import { addressKey, sameAddress } from '../domain/expedition/address';
import type { CellAddress, ExpeditionCheckpoint, ExpeditionPlan, SpaceSpec } from '../domain/expedition/types';
import type { GridPosition } from '../domain/types';
import { opposite } from '../domain/maze/movement';

type ExpeditionRecord = { plan: ExpeditionPlan; checkpoint: ExpeditionCheckpoint };
interface ExpeditionDb extends DBSchema {
  expeditions: { key: string; value: ExpeditionRecord };
}

const directions = ['north', 'east', 'south', 'west'];
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]';
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const natural = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const point = (value: unknown): value is GridPosition =>
  object(value) && Number.isSafeInteger(value.row) && Number.isSafeInteger(value.column);
const inside = (value: unknown, spec: SpaceSpec) => point(value) && value.row >= 0 && value.column >= 0 &&
  value.row < spec.rows && value.column < spec.columns;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid expedition: ${message}`);
}

/** Validate without repairing identities, regenerating geometry, or replacing loot. */
export function validateExpeditionRecord(value: unknown): asserts value is ExpeditionRecord {
  check(object(value) && object(value.plan) && object(value.checkpoint), 'record');
  const plan = value.plan as unknown as ExpeditionPlan;
  const checkpoint = value.checkpoint as unknown as ExpeditionCheckpoint;
  const recipe = plan.recipe;
  check(object(recipe) && recipe.version === 'spaces-v1', 'recipe version');
  check(text(recipe.worldId) && text(recipe.floorId) && text(plan.scopeId), 'plan identity');
  check(natural(recipe.level) && recipe.level > 0 && finite(recipe.seed), 'recipe parameters');
  check(Array.isArray(plan.spaces) && plan.spaces.length > 0, 'spaces');
  const spaces = new Map<string, SpaceSpec>();
  const chests = new Map<string, CellAddress>();
  for (const spec of plan.spaces) {
    check(object(spec) && text(spec.id) && !spaces.has(spec.id), 'space identity');
    check(['room', 'passage'].includes(spec.kind) && text(spec.name) && point(spec.origin), 'space metadata');
    check(natural(spec.rows) && spec.rows > 0 && natural(spec.columns) && spec.columns > 0 &&
      Number.isSafeInteger(spec.rows * spec.columns) && finite(spec.seed), 'space dimensions/seed');
    check(Array.isArray(spec.openings) && Array.isArray(spec.chests), 'space contents');
    spaces.set(spec.id, spec);
    for (const chest of spec.chests) {
      check(object(chest) && text(chest.id) && !chests.has(chest.id) && inside(chest.cell, spec), 'chest identity');
      chests.set(chest.id, { spaceId: spec.id, row: chest.cell.row, column: chest.cell.column });
    }
  }
  const address = (candidate: unknown): candidate is CellAddress => object(candidate) && text(candidate.spaceId) &&
    spaces.has(candidate.spaceId) && inside(candidate, spaces.get(candidate.spaceId)!);
  for (const spec of plan.spaces) {
    const ids = new Set<string>();
    const ports = new Set<string>();
    for (const opening of spec.openings) {
      check(object(opening) && text(opening.id) && !ids.has(opening.id), 'opening identity');
      check(inside(opening.cell, spec) && directions.includes(opening.direction) && address(opening.destination), 'opening address');
      const port = JSON.stringify([opening.cell.row, opening.cell.column, opening.direction]);
      check(!ports.has(port), 'duplicate opening port');
      ids.add(opening.id);
      ports.add(port);
    }
  }
  for (const spec of plan.spaces) {
    for (const opening of spec.openings) {
      const destination = spaces.get(opening.destination.spaceId)!;
      check(destination.openings.some(back => inside(back.cell, destination) &&
        back.cell.row === opening.destination.row && back.cell.column === opening.destination.column &&
        back.direction === opposite(opening.direction) &&
        sameAddress(back.destination, { spaceId: spec.id, row: opening.cell.row, column: opening.cell.column })), 'nonreciprocal opening');
    }
  }
  check(address(plan.start), 'start address');
  check(checkpoint.version === 1, 'checkpoint version');
  check(checkpoint.worldId === recipe.worldId && checkpoint.floorId === recipe.floorId &&
    checkpoint.scopeId === plan.scopeId, 'checkpoint identity');
  check(natural(checkpoint.revision) && natural(checkpoint.moves), 'checkpoint counters');
  check(address(checkpoint.position) && address(checkpoint.home), 'checkpoint address');
  check(['exploring', 'returning', 'complete'].includes(checkpoint.phase), 'checkpoint phase');
  check(Array.isArray(checkpoint.openedChestIds) && Array.from(checkpoint.openedChestIds).every(id => chests.has(id)) &&
    new Set(checkpoint.openedChestIds).size === checkpoint.openedChestIds.length, 'opened chest identities');
  const knowledge = checkpoint.knowledge;
  check(object(knowledge) && object(knowledge.cells) && object(knowledge.openings) && object(knowledge.chests), 'knowledge');
  for (const [kind, entries] of Object.entries(knowledge)) {
    check(['cells', 'openings', 'chests'].includes(kind) && object(entries), 'knowledge kind');
    const seen = new Set<string>();
    for (const entry of Object.values(entries)) {
      check(object(entry) && address(entry) && natural(entry.observedAt), 'knowledge address/time');
      const identity = kind === 'cells' ? addressKey(entry) : JSON.stringify([entry.spaceId, entry.id]);
      check(!seen.has(identity), 'duplicate knowledge identity');
      seen.add(identity);
      if (kind === 'cells') {
        check(Array.isArray(entry.links) && Array.from(entry.links).every(link => directions.includes(link)) &&
          new Set(entry.links).size === entry.links.length, 'known links');
      } else if (kind === 'chests') {
        check(text(entry.id) && chests.has(entry.id) && sameAddress(entry, chests.get(entry.id)!) &&
          typeof entry.opened === 'boolean' && entry.opened === checkpoint.openedChestIds.includes(entry.id), 'known chest identity/state');
      } else {
        const opening = spaces.get(entry.spaceId)!.openings.find(candidate => candidate.id === entry.id);
        check(opening && opening.cell.row === entry.row && opening.cell.column === entry.column &&
          opening.direction === entry.direction && (entry.destination === undefined ||
            (address(entry.destination) && sameAddress(entry.destination, opening.destination))), 'known opening identity');
      }
    }
  }
}

// Object insertion order is not part of a persisted record's identity; array order is.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function openDatabase() {
  return openDB<ExpeditionDb>('maze-battle-expeditions', 1, {
    upgrade(db) { db.createObjectStore('expeditions'); },
  });
}

export async function loadExpedition(slotId: string): Promise<ExpeditionRecord | undefined> {
  check(text(slotId), 'slot id');
  const db = await openDatabase();
  try {
    // An existing key with an undefined value is corruption, not an empty slot.
    const records = await db.getAll('expeditions', slotId, 1);
    if (records.length === 0) return undefined;
    const record: unknown = records[0];
    validateExpeditionRecord(record);
    return record;
  } finally {
    db.close();
  }
}

/** null is strictly create-only. Exact numeric-revision retries are no-ops.
 * A changed checkpoint must advance revision (possibly by several commands).
 * A slot's entire plan is immutable; replacement requires explicit deletion.
 */
export async function saveExpedition(
  slotId: string, plan: ExpeditionPlan, checkpoint: ExpeditionCheckpoint, expectedRevision: number | null,
): Promise<void> {
  check(text(slotId), 'slot id');
  check(expectedRevision === null || natural(expectedRevision), 'expected revision');
  // Take ownership before the first await, so a caller cannot change an in-flight write.
  const record = structuredClone({ plan, checkpoint });
  validateExpeditionRecord(record);
  check(expectedRevision === null || expectedRevision <= record.checkpoint.revision, 'revision regression');
  const db = await openDatabase();
  const tx = db.transaction('expeditions', 'readwrite');
  try {
    const records = await tx.store.getAll(slotId, 1);
    if (records.length === 0) {
      check(expectedRevision === null, 'revision conflict: slot missing');
    } else {
      const current: unknown = records[0];
      validateExpeditionRecord(current);
      check(expectedRevision !== null, 'revision conflict: slot exists');
      check(canonical(current.plan) === canonical(record.plan), 'plan identity changed');
      if (canonical(current) === canonical(record)) {
        await tx.done;
        return;
      }
      check(current.checkpoint.revision === expectedRevision && record.checkpoint.revision > expectedRevision,
        'revision conflict');
    }
    await tx.store.put(record, slotId);
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* A failed request may have already aborted the transaction. */ }
    await tx.done.catch(() => undefined);
    throw error;
  } finally {
    db.close();
  }
}

export async function deleteExpedition(slotId: string): Promise<void> {
  check(text(slotId), 'slot id');
  const db = await openDatabase();
  try {
    await db.delete('expeditions', slotId);
  } finally {
    db.close();
  }
}
