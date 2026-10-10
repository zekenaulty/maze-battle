import { fromLegacyState } from '../domain/gameFactory';
import type { SaveSlot } from '../domain/types';
import { getDatabase } from './saveRepository';
import { commitOriginalImport, finishOriginalImport, ORIGINAL_IMPORT_PREFIX, originalHash, originalImportKey, readOriginalImport, verifyOriginalImport } from './originalImportStore';
import type { OriginalImport } from './originalImportStore';

const SLOT_INDEX = 'DC-GAME-SAVE-SLOTS';
const MAX_SOURCES = 1024;
const MAX_SOURCE_LENGTH = 8 * 1024 * 1024;

export interface LegacyImportResult { imported: number; warnings: string[] }

export async function importLegacyLocalStorageSaves(): Promise<LegacyImportResult> {
  const result: LegacyImportResult = { imported: 0, warnings: [] };
  const warn = (key: string, error: unknown) => {
    const message = `${key.slice(0, 160)}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500);
    if (result.warnings.length < 24) result.warnings.push(message);
    else if (result.warnings.length === 24) result.warnings.push('Additional original-save warnings omitted.');
  };
  try {
    const sources = new Map<string, string>();
    const addSource = (key: string, label: string) => {
      if (key === SLOT_INDEX) return;
      if (key.length > 1024 || sources.size >= MAX_SOURCES) { warn(key, 'Source scan limit reached; source retained'); return; }
      sources.set(key, label);
    };
    try {
      const slots = readIndex();
      for (const slot of slots) {
        if (typeof slot !== 'string') { warn(SLOT_INDEX, 'Invalid slot name retained'); continue; }
        addSource(slotKey(slot), slot);
      }
    } catch (error) { warn(SLOT_INDEX, error); }
    // A broken/missing index or obsolete global flag must not hide surviving original saves.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('DC-GAME-') && !sources.has(key)) addSource(key, key.slice(8));
    }
    const db = await getDatabase();
    const pending: OriginalImport[] = [];
    const markers = await db.getAll('meta', IDBKeyRange.bound(ORIGINAL_IMPORT_PREFIX, ORIGINAL_IMPORT_PREFIX + '\uffff'), MAX_SOURCES);
    for (const row of markers) {
      try {
        const marker = readOriginalImport(row.value);
        if (row.key !== originalImportKey(marker.sourceKey, marker.sourceHash)) throw new Error('Mismatched import identity');
        if (marker.phase !== 'cleaned') pending.push(marker);
      } catch (error) { warn(row.key, error); }
    }
    const processed = new Set<string>();
    for (const [key, label] of sources) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) continue;
        if (raw.length > MAX_SOURCE_LENGTH) throw new Error('Original save exceeds 8 MiB characters; source retained');
        const sourceHash = await originalHash(raw);
        const identity = originalImportKey(key, sourceHash);
        processed.add(identity);
        const existing = await db.get('meta', identity);
        let marker: OriginalImport;
        if (existing) marker = readOriginalImport(existing.value);
        else {
          const game = fromLegacyState(label, JSON.parse(raw));
          const destinationId = `legacy-${await originalHash([key, sourceHash])}`;
          const slot: SaveSlot = {
            slotId: destinationId, label: cleanLabel(label), kind: 'imported',
            createdAt: game.createdAt, updatedAt: game.updatedAt, game,
          };
          marker = await commitOriginalImport({ sourceKey: key, sourceHash, destinationId, payloadHash: await originalHash(slot), phase: 'committed' }, slot);
        }
        if (marker.sourceKey !== key || marker.sourceHash !== sourceHash) throw new Error('Mismatched import identity; source retained');
        await verifyOriginalImport(marker);
        result.imported += await finishOriginalImport(marker, raw, () => cleanupSource(key));
      } catch (error) { warn(key, error); }
    }
    // Source deletion may have succeeded before index cleanup or the final marker commit failed.
    for (const marker of pending) {
      if (processed.has(originalImportKey(marker.sourceKey, marker.sourceHash))) continue;
      try {
        const raw = localStorage.getItem(marker.sourceKey);
        if (raw !== null) throw new Error('Original source identity changed; previous cleanup pending');
        await verifyOriginalImport(marker);
        result.imported += await finishOriginalImport(marker, null, () => cleanupSource(marker.sourceKey));
      } catch (error) { warn(marker.sourceKey, error); }
    }
  } catch (error) { warn('Original save import unavailable', error); }
  return result;
}

function slotKey(slot: string) { return `DC-GAME-${slot.toUpperCase()}`; }

function readIndex(): unknown[] {
  const raw = localStorage.getItem(SLOT_INDEX);
  if (raw === null) return [];
  if (raw.length > MAX_SOURCE_LENGTH) throw new Error('Slot index too large; cleanup pending');
  const slots: unknown = JSON.parse(raw);
  if (!Array.isArray(slots) || slots.length > MAX_SOURCES) throw new Error('Invalid slot index; cleanup pending');
  return slots;
}

function cleanupSource(key: string) {
  const remaining = readIndex().filter((slot) => typeof slot !== 'string' || slotKey(slot) !== key);
  localStorage.removeItem(key);
  if (localStorage.getItem(key) !== null) throw new Error('Source deletion failed; cleanup pending');
  if (remaining.length) localStorage.setItem(SLOT_INDEX, JSON.stringify(remaining));
  else localStorage.removeItem(SLOT_INDEX);
  const index = localStorage.getItem(SLOT_INDEX);
  if (index !== (remaining.length ? JSON.stringify(remaining) : null)) throw new Error('Index cleanup failed; cleanup pending');
}

function cleanLabel(slot: string) {
  return slot.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Imported Save';
}
