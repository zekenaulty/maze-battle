import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { ActionResult, ProtocolRead } from '../../src/persistence/canonical/agentica/types';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readActionResultSource } from '../../src/persistence/canonical/agentica/actions.result';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { CanonicalRecord, JsonObject } from '../../src/persistence/canonical/types';
import type { KnowledgeAnchor, KnowledgeRead } from '../../src/persistence/canonical/knowledge/types';
import { observationKey } from '../../src/persistence/canonical/knowledge/keys';
import { observationHeaderRecord } from '../../src/persistence/canonical/knowledge/observation.validation';

export interface Access { method: string; area: string; key: string; count?: number }
export interface ObservationProbe { anchor: KnowledgeAnchor | null; header: CanonicalRecord | null; integrity: CanonicalRecord | null }
export function guarded<T extends KnowledgeRead>(pages: T, questId: string, accesses: Access[], observation: ObservationProbe): T {
  const anchor = structuredClone(observation.anchor), root = anchor ? observationKey(anchor.sequence) : null;
  let chunks: string[] = [];
  return new Proxy(pages, { get(target, name) {
    if (name === 'get' || name === 'scan' || name === 'witness') return (area: string, key: string, ...args: unknown[]) => {
      accesses.push({ method: name, area, key, ...(name === 'scan' ? { count: args[1] as number } : {}) });
      if (name === 'get' && area === 'knowledge') {
        if (!anchor || key !== root && !(observation.header && key === `${root}/integrity`)
          && !chunks.some((_, index) => key === `${root}/${index}`)) throw Error(`Unexpected memory or history read: ${key}`);
        return target.get('knowledge', key).then(row => {
          if (key === root) {
            chunks = observationHeaderRecord(row, { sequence: anchor.sequence, id: anchor.id }).chunks;
            observation.header = structuredClone(row ?? null);
          } else if (key === `${root}/integrity`) observation.integrity = structuredClone(row ?? null);
          return row;
        });
      }
      if (name === 'get' && area === 'world' && ![`quest/${questId}`, `contract/${questId}`, 'roster/pack',
        'roster/stash', `roster/item/quest-item:${questId}`].includes(key)) throw Error(`Hidden world read: ${key}`);
      if (name === 'scan' && (area !== 'world' || args[0] !== undefined || args[1] !== 1
        || key !== `roster/quest-items/${questId}/` && !key.startsWith('roster/items/'))) throw Error('Unbounded or foreign scan');
      if (name === 'witness' && area !== 'execution' && (area !== 'knowledge' || key !== 'perception/'))
        throw Error('Foreign witness');
      return Reflect.apply(Reflect.get(target, name) as (...args: unknown[]) => unknown, target, [area, key, ...args]);
    };
    const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value;
  } });
}
export async function rejectForeignObservationReads(input: KnowledgeAnchor) {
  const anchor = structuredClone(input), sequence = anchor.sequence, key = observationKey(sequence), accesses: Access[] = [];
  const foreign = observationKey(sequence > 1 ? sequence - 1 : sequence + 1);
  return (await readCanonical(async pages => {
    const read = guarded(pages, 'unused', accesses, { anchor, header: null, integrity: null }), refusals = [];
    for (const requested of [foreign, `${key}/previous`, `${foreign}/integrity`,
      `${key}/integrity/extra`, `${key}/8`, 'perception/room/1/entry']) {
      let message = '';
      try { await read.get('knowledge', requested); } catch (cause) { message = String(cause); }
      refusals.push({ key: requested, message });
    }
    return { refusals, accesses };
  })).value;
}
export async function retained(action: AgenticaAction, forbidCurrent = false) {
  const identity = await prepareAction(action), accesses: Access[] = [];
  const value = (await readCanonical(async pages => {
    const historical: ProtocolRead = {
      async get(area, key) {
        accesses.push({ method: 'get', area, key });
        if (forbidCurrent && area !== 'execution') throw Error('Replay consulted current domain');
        return pages.get(area, key);
      },
      savedSnapshot: key => { accesses.push({ method: 'savedSnapshot', area: 'execution', key }); return pages.savedSnapshot(key); },
      sourceReceipt: key => { accesses.push({ method: 'sourceReceipt', area: 'execution', key }); return pages.sourceReceipt(key); },
    };
    const action = await readAction(historical, identity);
    if (!action?.resultReference) throw Error('Missing completed native original');
    return { action, source: await readActionResultSource(historical, identity, action.resultReference) };
  })).value;
  return { ...value, accesses };
}
/** Corruption of this fresh native DB only, after an authentic original result has committed. */
export async function damage(action: AgenticaAction, kind: 'root' | 'admission' | 'arrival' | 'completion') {
  const kept = await retained(action), result = kept.source, db = await openCanonicalDatabase(), { head } = await readCanonicalHead();
  try {
    if (kind === 'root') {
      const root = (await db.getAll('records')).find(row => row.id === result.objective!.publication.id)!;
      await db.delete('receipts', [head.gameId, (root.value as JsonObject).sourceAttemptId as string]);
    } else if (kind === 'admission') await db.delete('receipts', [head.gameId, result.objective!.admissionAttemptId]);
    else {
      const row = (await db.getAll('records')).find(row => row.id === kept.action.resultReference!.id)!;
      const value = row.value as unknown as ActionResult;
      if (kind === 'arrival') value.objective!.evidence.arrival = { sequence: 999, id: 'foreign-observation', index: 0 };
      else value.result.completion = { objectiveId: 'arbitrary-objective', evidenceId: value.result.evidenceId, summary: 'Forged completion.' };
      await db.put('records', row, [head.gameId, row.id]);
      // Keep the generic result witness internally consistent to exercise objective-specific validation.
      const receipt = (await db.get('receipts', [head.gameId, result.sourceAttemptId]))!;
      (receipt.result as JsonObject).recordWitness = canonicalJson(row);
      await db.put('receipts', receipt, [head.gameId, receipt.attemptId]);
    }
  } finally { db.close(); }
}
