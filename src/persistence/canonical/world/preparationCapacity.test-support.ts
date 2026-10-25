import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { createModuleRecipe, type ModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { appendedBytes, storedBytes } from '../accounting';
import { workBudget } from '../budget';
import { checkpointJson, gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { commitFloorPreparation } from '../game/preparation';
import { CanonicalPages } from '../pages';
import type { CanonicalWork } from '../transaction';
import { DEFAULT_QUOTA, type CanonicalHead, type CanonicalRecord, type CanonicalIndexNode,
  type CanonicalReceipt, type CanonicalWorkStats, type CanonicalWrite, type Json } from '../types';
import { createWorldFloor } from './generation';
import { loadFloor } from './records';
import type { PreparationCapacityPhase } from './preparationCapacity';

export interface PreparationMeasurement {
  level: number; phase: PreparationCapacityPhase; recordsBytes: number; nodesBytes: number; receiptsBytes: number;
  bytes: number; records: number; nodes: number; values: { key: string; valueBytes: number; bucketEntries?: number }[];
  work?: CanonicalWorkStats; nodePrefixes?: string[];
}
interface PreparationBirth {
  head: CanonicalHead; worldId: string; records: CanonicalRecord[]; nodes: CanonicalIndexNode[];
}
const now = '2026-10-22T00:00:00.000Z';

/** Real domain writers, CanonicalPages and MemoryTree.flush; in-memory storage, NOT native/kernel qualification. */
export function preparationMemory(seed: number, inputBirth?: PreparationBirth) {
  const birth = inputBirth && structuredClone(inputBirth);
  const records = new Map<string, CanonicalRecord>(birth?.records.map(r => [r.id, r]));
  const nodes = new Map<string, CanonicalIndexNode>(birth?.nodes.map(r => [r.node.id, r]));
  const checkpoint: GameCheckpoint = birth ? gameCheckpoint(birth.head.checkpoint) : { schema: 1, kind: 'rpg', mode: 'manual',
    position: { level: 1, cell: { spaceId: 'entry', row: 4, column: 4 } }, knowledge: null,
    facing: 'east', wave: 1, createdAt: now, updatedAt: now, activityLog: [] };
  let head: CanonicalHead = birth?.head ?? { schema: 1, generation: crypto.randomUUID(), gameId: crypto.randomUUID(), owner: 'owner',
    epoch: 1, revision: 0, status: 'ready', checkpoint: checkpointJson(checkpoint),
    roots: { world: null, knowledge: null, execution: null }, allocations: {},
    quota: { ...DEFAULT_QUOTA, usedBytes: 0, reservedBytes: 0, reservations: 0 } };
  const tx = { mode: 'readwrite', objectStore: (name: string) => ({
    get: async (key: [string, string]) => structuredClone(name === 'records' ? records.get(key[1]) : nodes.get(key[1])),
  }) } as unknown as CanonicalWrite;
  const measurements: PreparationMeasurement[] = [];
  async function commit(level: number, phase: PreparationCapacityPhase, work: (pages: CanonicalPages, attemptId: string) => Promise<Json>) {
    const budget = workBudget(), pages = new CanonicalPages(tx, head, budget), attemptId = crypto.randomUUID();
    const source = { attemptId, expected: { generation: head.generation, gameId: head.gameId, owner: head.owner,
      epoch: head.epoch, revision: head.revision }, operation: 'game.prepare', input: { level }, deadlineAt: null };
    const result = await work(pages, attemptId), staged = await pages.prepare();
    const receipt: CanonicalReceipt = { generation: head.generation, gameId: head.gameId, attemptId,
      fingerprint: canonicalJson(source), beforeRevision: head.revision, afterRevision: head.revision + 1,
      committedAt: now, result };
    const recordsBytes = appendedBytes(staged.records, []), nodesBytes = appendedBytes([], staged.nodes);
    const receiptsBytes = phase === 'bootstrap' && level === 1 ? 0 : storedBytes('receipts', [head.gameId, attemptId], receipt);
    measurements.push({ level, phase, recordsBytes, nodesBytes, receiptsBytes, bytes: recordsBytes + nodesBytes + receiptsBytes,
      records: staged.records.length, nodes: staged.nodes.length,
      ...(birth ? { work: budget.snapshot(), nodePrefixes: staged.nodes.map(r => r.node.prefix) } : {}),
      values: staged.records.map(r => ({ key: r.key, valueBytes: new TextEncoder().encode(JSON.stringify(r.value)).length,
        ...(Array.isArray(r.value) ? { bucketEntries: r.value.length } : {}) })) });
    for (const row of staged.records) records.set(row.id, row);
    for (const row of staged.nodes) nodes.set(row.node.id, row);
    head = { ...head, revision: head.revision + 1, roots: staged.roots };
    return result;
  }
  async function floor(level: number, options: Partial<Pick<ModuleRecipe, 'roomBudget' | 'policy' | 'spatial'>> = {}) {
    const pages = new CanonicalPages(tx, head, workBudget());
    const established = birth && level === 1 ? await loadFloor(pages, 1) : level > 1 ? await loadFloor(pages, level - 1) : undefined;
    const recipe = { ...createModuleRecipe(birth?.worldId ?? 'capacity-world', level, seed + level - 1,
      { spatial: !!(established?.generation.recipe.spatial ?? options.spatial) }), ...structuredClone(options) };
    if (level > 1) {
      const pages = new CanonicalPages(tx, head, workBudget()), previous = await loadFloor(pages, level - 1);
      checkpoint.position = { level: level - 1, cell: previous.exit! }; head.checkpoint = checkpointJson(checkpoint);
    }
    // Splitting the next-floor birth from its first expansion conservatively flushes MORE nodes than the App.
    // An imported complete birth already contains floor one's generation marker.
    if (!birth || level !== 1) await commit(level, 'bootstrap', async pages => {
      await createWorldFloor(pages, recipe);
      await pages.set('world', `game/preparation/${level}`, { schema: 1, level, phase: 'generation' }); return {};
    });
    let phase: PreparationCapacityPhase | 'ready' = 'generation';
    while (phase !== 'ready') {
      // This writer-bound harness excludes kernel allocation/receipt metadata; native tests own that proof.
      const output = await commit(level, phase, (pages, attemptId) => commitFloorPreparation({ head, pages,
        privatePreparation: async () => ({ close() {} }), setCheckpoint() { throw Error('Unexpected checkpoint'); },
        restoreSnapshot() { throw Error('Unexpected restore'); }, liveOperation() { throw Error('Unexpected custody'); }
      } satisfies CanonicalWork, { level }, attemptId));
      phase = (output as { phase: PreparationCapacityPhase | 'ready' }).phase;
    }
    return recipe;
  }
  const read = <T>(work: (pages: CanonicalPages) => Promise<T>) => work(new CanonicalPages(tx, head, workBudget()));
  return { floor, measurements, records, nodes, read };
}
