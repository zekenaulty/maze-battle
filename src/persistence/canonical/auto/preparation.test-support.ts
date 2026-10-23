import { vi } from 'vitest';
import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { bootstrapModule } from '../../../domain/expedition/topology/modules/step';
import { roster } from '../../../domain/items/roster.testSupport';
import { accountHead, appendedBytes } from '../accounting';
import { protocolHead } from '../agentica/types.test-support';
import { workBudget } from '../budget';
import { checkpointJson, gameCheckpoint, rosterContext } from '../game/checkpoint';
import { commitFloorPreparation } from '../game/preparation';
import { recordGameObservation } from '../knowledge/write';
import { CanonicalPages } from '../pages';
import { seedRoster } from '../roster/write';
import type { CanonicalWork } from '../transaction';
import type { CanonicalIndexNode, CanonicalRecord, CanonicalWorkLimits, CanonicalWrite } from '../types';
import { createWorldFloor } from '../world/generation';
import { loadFloor } from '../world/records';
import { initialAutoState, saveAutoState } from './records';

/** Real pages/COW and domain handlers; only the IDB object-store transport is in memory. */
export async function preparationFixture(care: 'none' | 'unavailable' | 'available' = 'none') {
  let head = protocolHead(), initialized = false;
  const records = new Map<string, CanonicalRecord>(), nodes = new Map<string, CanonicalIndexNode>();
  async function work<T>(effect: (tx: CanonicalWork) => Promise<T>, limits?: CanonicalWorkLimits) {
    const before = structuredClone(head), budget = workBudget(limits);
    const storage = { mode: 'readwrite', objectStore: (name: string) => ({ get: async (key: string[]) => {
      if (name !== 'records' && name !== 'nodes') throw Error(`Unexpected store: ${name}`);
      return structuredClone(name === 'records' ? records.get(key[1]) : nodes.get(key[1]));
    } }) } as unknown as CanonicalWrite;
    const pages = new CanonicalPages(storage, before, budget);
    let checkpoint = before.checkpoint;
    const set = vi.spyOn(pages, 'set'), remove = vi.spyOn(pages, 'delete');
    const setCheckpoint = vi.fn<CanonicalWork['setCheckpoint']>(value => { checkpoint = structuredClone(value); });
    const result = await effect({ head: structuredClone(before), pages, setCheckpoint,
      restoreSnapshot: async () => { throw Error('Unexpected restore'); }, liveOperation: async () => { throw Error('Unexpected operation'); } });
    const staged = await pages.prepare();
    const after = accountHead(initialized ? before : undefined,
      { ...before, revision: before.revision + 1, roots: staged.roots, checkpoint }, appendedBytes(staged.records, staged.nodes));
    for (const row of staged.records) records.set(row.id, row);
    for (const row of staged.nodes) nodes.set(row.node.id, row);
    head = after; initialized = true;
    return { result, before, after: structuredClone(after), staged, set, remove, setCheckpoint, stats: budget.snapshot() };
  }
  const recipe = createModuleRecipe('auto-preparation', 1, 781), initial = bootstrapModule(recipe).space;
  head.checkpoint = checkpointJson({ ...gameCheckpoint(head.checkpoint), mode: 'auto-play',
    position: { level: 1, cell: { spaceId: initial.id, row: Math.floor(initial.rows / 2), column: Math.floor(initial.columns / 2) } } });
  const party = roster([], rosterContext(gameCheckpoint(head.checkpoint)));
  if (care !== 'none') {
    party.party[0].hp = Math.ceil(party.party[0].maxHp / 2);
    party.party.find(actor => actor.role === 'healer')!.mp = care === 'unavailable' ? 0 : 110;
  }
  await work(async tx => {
    await createWorldFloor(tx.pages, recipe);
    await tx.pages.set('world', 'game/preparation/1', { schema: 1, level: 1, phase: 'generation' });
    await seedRoster(tx.pages, party);
  });
  let phase = 'generation';
  for (let n = 0; phase !== 'ready' && n < 128; n++)
    phase = (await work(tx => commitFloorPreparation(tx, { level: 1 }, `setup-${n}`))).result.phase;
  if (phase !== 'ready') throw Error('Fixture preparation exceeded bound');
  await work(async tx => {
    const checkpoint = gameCheckpoint(tx.head.checkpoint), floor = await loadFloor(tx.pages, 1);
    if (!floor.exit) throw Error('Fixture floor has no exit');
    const offers = await tx.pages.scan('world', 'contracts/1/', undefined, 16);
    if (offers.next) throw Error('Fixture offers exceeded bound');
    for (const offer of offers.rows) await tx.pages.delete('world', offer.key);
    const observed = await recordGameObservation(tx, { ...checkpoint, position: { level: 1, cell: floor.exit } });
    tx.setCheckpoint(checkpointJson(observed));
    const state = initialAutoState(observed, tx.head.revision + 1);
    state.completed = true; state.descent = observed.position;
    state.objective = { kind: 'exit', id: 'exit:1', roomId: observed.position.cell.spaceId };
    // Intentionally no root waypoint: preparation must not create one incidentally.
    await saveAutoState(tx.pages, state);
  });
  return { work, snapshot: () => structuredClone(head), party };
}
