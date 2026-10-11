import { openDB } from 'idb';
import type { CellAddress } from '../../../domain/expedition/types';
import type { LaunchConfiguration } from './configuration';

export type LaunchPhase = 'preparing' | 'prepared' | 'starting' | 'running' | 'recovery-required' | 'completed' | 'failed' | 'cancelled';
export interface LaunchEvent { time: string; type: string; text: string }
export interface LaunchJournal {
  version: 1; slot: string; phase: LaunchPhase; config: LaunchConfiguration;
  destinations: { label: string; address: CellAddress }[]; selected: number;
  runId?: string; originalRunId?: string; events: LaunchEvent[]; error?: string;
}
const database = () => openDB('maze-agentica-launch', 1, { upgrade(db) { db.createObjectStore('journal'); } });
export async function readLaunchJournal(): Promise<LaunchJournal | undefined> {
  const db = await database();
  try {
    const value = await db.get('journal', 'active');
    if (value && (value.version !== 1 || !value.slot || !Array.isArray(value.destinations))) throw new Error('Unsupported launch journal; existing saves are untouched.');
    return value;
  } finally { db.close(); }
}
export async function writeLaunchJournal(value: LaunchJournal) {
  const db = await database();
  try { await db.put('journal', structuredClone(value), 'active'); } finally { db.close(); }
}
/** Coalesce operator telemetry writes; retain only one in-flight and one newest snapshot. */
export function journalWriter(write = writeLaunchJournal) {
  let pending: LaunchJournal | undefined, active: Promise<void> | undefined, fault: unknown;
  return (journal: LaunchJournal): Promise<void> => {
    if (fault) return Promise.reject(fault);
    pending = journal;
    if (!active) {
      active = (async () => {
        try { while (pending) { const current = pending; pending = undefined; await write(current); } }
        catch (error) { fault = error; pending = undefined; throw error; }
        finally { active = undefined; }
      })();
    }
    return active;
  };
}
export function appendLaunchEvent(journal: LaunchJournal, type: string, text: string): LaunchJournal {
  return { ...journal, events: [...journal.events, { time: new Date().toISOString(), type, text: text.slice(0, 1200) }].slice(-80) };
}
export function retainedLaunchPhase(journal: LaunchJournal): LaunchPhase {
  if (journal.phase === 'preparing') return 'failed';
  return ['starting', 'running'].includes(journal.phase) ? 'recovery-required' : journal.phase;
}
export function mayPrepare(journal?: LaunchJournal) {
  return !journal || ['prepared', 'completed', 'failed', 'cancelled'].includes(journal.phase);
}
