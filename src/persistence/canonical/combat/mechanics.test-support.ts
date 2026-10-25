import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { bootstrapModule } from '../../../domain/expedition/topology/modules/step';
import { roster } from '../../../domain/items/roster.testSupport';
import { protocolHead } from '../agentica/types.test-support';
import { accountHead, appendedBytes } from '../accounting';
import { workBudget } from '../budget';
import { checkpointJson, gameCheckpoint, rosterContext } from '../game/checkpoint';
import { commitFloorPreparation } from '../game/preparation';
import { DEFAULT_SETTINGS } from '../game/settings';
import { recordGameObservation } from '../knowledge/write';
import { CanonicalPages } from '../pages';
import { loadRoster } from '../roster/projection';
import { saveRoster, seedRoster } from '../roster/write';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalHead, CanonicalRequest, CanonicalWrite, Json } from '../types';
import { createWorldFloor } from '../world/generation';
import { loadFloor } from '../world/records';
import { loadWorldRoom } from '../world/residency';
import { memoryStorage } from './storage.test-support';
import { loadBattle, saveBattle } from './records';
import type { CanonicalBattle } from './types';

let base: Promise<ReturnType<ReturnType<typeof memoryStorage>['snapshot']>> | undefined;

export async function mechanicsFixture() {
  const storage = memoryStorage(base ? await base : undefined);
  const head = () => storage.get('heads', 'game') as CanonicalHead;
  async function work<T>(effect: (tx: CanonicalWork) => Promise<T>) {
    const before = head(), transport = storage.transaction(), pages = new CanonicalPages(transport as unknown as CanonicalWrite, before, workBudget());
    let checkpoint = before.checkpoint;
    const result = await effect({ head: before, pages, setCheckpoint: value => { checkpoint = structuredClone(value); },
      privatePreparation: async () => ({ close() {} }), restoreSnapshot: async () => { throw Error('Use kernel restore'); },
      liveOperation: async () => { throw Error('Unexpected operation'); } });
    const staged = await pages.prepare();
    const after = accountHead(before, { ...before, revision: before.revision + 1, roots: staged.roots, checkpoint }, appendedBytes(staged.records, staged.nodes));
    for (const r of staged.records) await transport.objectStore('records').add(r, [r.gameId, r.id]);
    for (const r of staged.nodes) await transport.objectStore('nodes').add(r, [r.gameId, r.node.id]);
    await transport.objectStore('heads').put(after, after.gameId);
    await new Promise<void>((resolve, reject) => { transport.done.then(() => resolve(), reject); });
    return { result, staged, head: after };
  }
  async function read<T>(query: (pages: CanonicalPages, head: CanonicalHead) => Promise<T>, snapshot = head()) {
    const pages = new CanonicalPages(storage.transaction('readonly') as unknown as CanonicalWrite, snapshot, workBudget());
    const value = await query(pages, snapshot); pages.finishRead(); return value;
  }
  if (!base) {
    const initial = protocolHead(), recipe = createModuleRecipe('combat-test', 1, 781), space = bootstrapModule(recipe).space;
    initial.checkpoint = checkpointJson({ ...gameCheckpoint(initial.checkpoint), mode: 'manual',
      position: { level: 1, cell: { spaceId: space.id, row: Math.floor(space.rows / 2), column: Math.floor(space.columns / 2) } } });
    storage.put('meta', 'schema', { schema: 1, generation: initial.generation, gameId: initial.gameId }); storage.put('heads', 'game', initial);
    await work(async tx => {
      await createWorldFloor(tx.pages, recipe); await seedRoster(tx.pages, roster([], rosterContext(gameCheckpoint(tx.head.checkpoint))));
      await tx.pages.set('world', 'game/settings', DEFAULT_SETTINGS);
      await tx.pages.set('world', 'game/preparation/1', { schema: 1, level: 1, phase: 'generation' });
    });
    let phase = 'generation';
    for (let i = 0; i < 128 && phase !== 'ready'; i++) phase = (await work(tx => commitFloorPreparation(tx, { level: 1 }, `setup-${i}`))).result.phase;
    if (phase !== 'ready') throw Error('Combat fixture preparation exceeded bound');
    await work(async tx => { tx.setCheckpoint(checkpointJson(await recordGameObservation(tx, gameCheckpoint(tx.head.checkpoint)))); });
    base = Promise.resolve(storage.snapshot());
  }
  let sequence = 0;
  const request = (input: Json, operation = 'battle.command'): CanonicalRequest => ({ attemptId: `command-${++sequence}`, operation, input,
    expected: canonicalFence(head()), deadlineAt: null });
  async function editBattle(change: (value: CanonicalBattle) => void) {
    return work(async tx => { const before = (await loadBattle(tx.pages))!, next = structuredClone(before); change(next); await saveBattle(tx.pages, before, next); });
  }
  async function editParty(change: (state: Awaited<ReturnType<typeof loadRoster>>['state']) => void) {
    return work(async tx => { const before = await loadRoster(tx.pages, rosterContext(gameCheckpoint(tx.head.checkpoint)));
      const next = structuredClone(before.state); change(next); await saveRoster(tx.pages, before, next); });
  }
  async function atRoom(spaceId: string) {
    return work(async tx => {
      const room = await loadWorldRoom(tx.pages, 1, spaceId), c = gameCheckpoint(tx.head.checkpoint);
      const center = room.geometry.cells.find(p => p.row === Math.floor(room.space.spec.rows / 2) && p.column === Math.floor(room.space.spec.columns / 2))!;
      tx.setCheckpoint(checkpointJson(await recordGameObservation(tx, { ...c, position: { level: 1, cell: { spaceId, row: center.row, column: center.column } } })));
    });
  }
  const floor = () => read(pages => loadFloor(pages, 1));
  return { storage, head, work, read, request, editBattle, editParty, atRoom, floor,
    current: () => read(loadBattle), roster: () => read((pages, h) => loadRoster(pages, rosterContext(gameCheckpoint(h.checkpoint)))) };
}
