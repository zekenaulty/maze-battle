import { getDatabase } from '../saveRepository';
import type { GameWrite } from '../gameTransaction';
import { RPG_TRAVEL_STORES } from '../rpgTravel/execute';
import { boundedJson } from '../agenticaValidation';
import { requireRpg } from '../../services/agentica/rpg/validation';

export const RPG_AGENTICA_STORES = [...RPG_TRAVEL_STORES, 'rpgAgenticaRuns', 'rpgAgenticaActions',
  'rpgAgenticaOperations', 'rpgAgenticaEvents', 'rpgAgenticaAdvances'] as const;

export class RpgWorkCancelled extends Error { constructor() { super('Local Agentic Play work was paused.'); } }
export async function rpgAgenticaWrite<T>(work: (tx: GameWrite) => Promise<T>, signal?: AbortSignal) {
  if (signal?.aborted) throw new RpgWorkCancelled();
  const db = await getDatabase(), tx = db.transaction([...RPG_AGENTICA_STORES], 'readwrite');
  void tx.done.catch(() => {});
  const abort = () => { try { tx.abort(); } catch { /* Already settled. */ } };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try { const value = await work(tx); await tx.done; return value; }
  catch (error) { abort(); if (signal?.aborted) throw new RpgWorkCancelled(); throw error; }
  finally { signal?.removeEventListener('abort', abort); }
}

// Corruption witness, not an authentication claim against a malicious database editor.
export function sealHost<T extends object>(value: T): T & { witness: string } {
  return { ...value, witness: boundedJson(value) };
}
export function checkHost<T extends { witness: string }>(value: T) {
  requireRpg(value && typeof value === 'object', 'missing host record');
  const { witness, ...body } = value;
  requireRpg(witness === boundedJson(body), 'host record witness changed');
  return value;
}
