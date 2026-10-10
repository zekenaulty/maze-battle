import type { SaveSlot } from '../domain/types';
import { getDatabase } from './saveRepository';

export const ORIGINAL_IMPORT_PREFIX = 'original-save-v1:';
export interface OriginalImport {
  sourceKey: string;
  sourceHash: string;
  destinationId: string;
  payloadHash: string;
  phase: 'committed' | 'verified' | 'cleaned';
}

export async function originalHash(value: unknown) {
  // JSON encoding also distinguishes lone UTF-16 surrogates in localStorage strings.
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function originalImportKey(sourceKey: string, sourceHash: string) {
  return ORIGINAL_IMPORT_PREFIX + JSON.stringify([sourceKey, sourceHash]);
}

export function readOriginalImport(value: string): OriginalImport {
  const marker = JSON.parse(value) as OriginalImport;
  if (!marker || typeof marker.sourceKey !== 'string' || !marker.sourceKey.startsWith('DC-GAME-')
    || !/^[a-f0-9]{64}$/.test(marker.sourceHash) || !/^[a-f0-9]{64}$/.test(marker.payloadHash)
    || typeof marker.destinationId !== 'string' || !marker.destinationId.startsWith('legacy-')
    || !['committed', 'verified', 'cleaned'].includes(marker.phase)) throw new Error('Invalid original import marker');
  return marker;
}

export async function commitOriginalImport(marker: OriginalImport, slot: SaveSlot) {
  const db = await getDatabase();
  const tx = db.transaction(['saves', 'meta'], 'readwrite', { durability: 'strict' });
  const key = originalImportKey(marker.sourceKey, marker.sourceHash);
  try {
    const existing = await tx.objectStore('meta').get(key);
    if (existing) {
      await tx.done;
      return readOriginalImport(existing.value);
    }
    if (await tx.objectStore('saves').get(slot.slotId)) throw new Error('Import destination already exists; source retained');
    await tx.objectStore('saves').add(slot);
    await tx.objectStore('meta').add({ key, value: JSON.stringify(marker) });
    await tx.done;
    return marker;
  } catch (error) {
    try { tx.abort(); } catch { /* Already completed/aborted. */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export async function verifyOriginalImport(marker: OriginalImport) {
  if (marker.phase !== 'committed') return;
  const db = await getDatabase();
  const slot = await db.get('saves', marker.destinationId);
  if (!slot || await originalHash(slot) !== marker.payloadHash) throw new Error('Import readback verification failed; source retained');
  const snapshot = JSON.stringify(slot);
  const tx = db.transaction(['saves', 'meta'], 'readwrite', { durability: 'strict' });
  try {
    const key = originalImportKey(marker.sourceKey, marker.sourceHash);
    const current = await tx.objectStore('meta').get(key);
    if (!current) throw new Error('Import marker missing; source retained');
    const latest = readOriginalImport(current.value);
    if (latest.phase === 'committed') {
      // Hashing cannot hold an IDB transaction open. Check the exact readback again under its write lock.
      if (JSON.stringify(await tx.objectStore('saves').get(marker.destinationId)) !== snapshot) {
        throw new Error('Import destination changed during verification; source retained');
      }
      await tx.objectStore('meta').put({ key, value: JSON.stringify({ ...latest, phase: 'verified' }) });
    }
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* Already completed/aborted. */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export async function finishOriginalImport(marker: OriginalImport, expectedRaw: string | null, cleanup: () => void) {
  const db = await getDatabase();
  // Serialize localStorage check/delete/index edits under a native write lock, even without
  // Web Locks. Cleanup is synchronous: no await in the check/delete/index window.
  const tx = db.transaction(['saves', 'meta'], 'readwrite', { durability: 'strict' });
  try {
    const key = originalImportKey(marker.sourceKey, marker.sourceHash);
    const current = await tx.objectStore('meta').get(key);
    if (!current) throw new Error('Import marker missing; cleanup pending');
    const latest = readOriginalImport(current.value);
    if (latest.phase === 'committed') throw new Error('Import not verified; source retained');
    const currentRaw = localStorage.getItem(marker.sourceKey);
    if (currentRaw !== null && currentRaw !== expectedRaw) throw new Error('Original source changed; cleanup pending');
    cleanup();
    await tx.objectStore('meta').put({ key, value: JSON.stringify({ ...latest, phase: 'cleaned' }) });
    await tx.done;
    return latest.phase === 'cleaned' ? 0 : 1;
  } catch (error) {
    try { tx.abort(); } catch { /* Already completed/aborted. */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
