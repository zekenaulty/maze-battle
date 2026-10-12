import { getDatabase } from '../saveRepository';
import type { GameWrite } from '../gameTransaction';
import { RPG_TRAVEL_STORES } from '../rpgTravel/execute';
import { boundedJson } from '../agenticaValidation';
import { requireRpg } from '../../services/agentica/rpg/validation';

export const RPG_AGENTICA_STORES = [...RPG_TRAVEL_STORES, 'rpgAgenticaRuns', 'rpgAgenticaActions',
  'rpgAgenticaOperations', 'rpgAgenticaEvents', 'rpgAgenticaAdvances'] as const;

export async function rpgAgenticaWrite<T>(work: (tx: GameWrite) => Promise<T>) {
  const db = await getDatabase(), tx = db.transaction([...RPG_AGENTICA_STORES], 'readwrite');
  void tx.done.catch(() => {});
  try { const value = await work(tx); await tx.done; return value; }
  catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } throw error; }
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
