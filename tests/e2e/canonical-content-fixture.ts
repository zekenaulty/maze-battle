import type { CanonicalWork } from '../../src/persistence/canonical/transaction';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { beginWorldFloorQuality, advanceWorldFloorQuality, loadWorldQuality } from '../../src/persistence/canonical/world/quality';
import { beginWorldRoomRoles, advanceWorldRoomRoles, loadWorldRoleCompilation } from '../../src/persistence/canonical/world/roles';
import * as content from '../../src/persistence/canonical/content/preparation';
import * as records from '../../src/persistence/canonical/content/records';
import { executeContentCommand, commitContentCommand } from '../../src/persistence/canonical/game/contentCommand';
import { recordRoomQuestVisit } from '../../src/persistence/canonical/content/questActions';
import { gameCheckpoint, checkpointJson } from '../../src/persistence/canonical/game/checkpoint';
import { encodeRoster } from '../../src/persistence/canonical/roster/codec';
import type { ContentCommand } from '../../src/persistence/canonical/content/types';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import type { Json } from '../../src/persistence/canonical/types';
import { json } from '../../src/persistence/canonical/world/records';
import { resolveWorldStep } from '../../src/persistence/canonical/world/residency';
import * as roster from './canonical-roster-fixture';
import { finishFloor, worldRequest } from './canonical-world-fixture';

export { content, records, executeContentCommand, commitContentCommand, recordRoomQuestVisit };
export * from '../../src/persistence/canonical/content/queries';
export async function work(callback: (tx: CanonicalWork) => Promise<Json>) {
  const { head } = await readCanonicalHead(); return executeCanonical(worldRequest(head, 'fixture.content'), callback);
}
export async function prepare(level = 1) {
  await finishFloor(level);
  await work(async tx => json(await beginWorldFloorQuality(tx.pages, level)));
  while ((await readCanonical(p => loadWorldQuality(p, level))).value.status === 'running')
    await work(async tx => json(await advanceWorldFloorQuality(tx.pages, level)));
  await work(async tx => json(await beginWorldRoomRoles(tx.pages, level)));
  while (!(await readCanonical(p => loadWorldRoleCompilation(p, level))).value.plan)
    await work(async tx => json(await advanceWorldRoomRoles(tx.pages, level)));
  await work(async tx => json(await content.beginWorldContent(tx.pages, level)));
  for (let n = 0; n < 512; n++) {
    const current = (await readCanonical(p => content.loadWorldContent(p, level))).value;
    if (current.nextRoom === current.binding.roomCount) return;
    await work(async tx => json(await content.advanceWorldContent(tx.pages, level)));
  }
  throw Error('Fixture content budget exhausted');
}
export async function seed() { await roster.seed(); await prepare(); return targets(); }
export async function targets(level = 1) {
  return (await readCanonical(async p => {
    const roles = await loadWorldRoleCompilation(p, level), targets = [];
    for (const space of [...roles.plan!.specialtyIds, roles.plan!.exitId]) {
      const room = await records.loadRoomContent(p, level, space);
      const contract = room.contractId ? await records.loadContract(p, room.contractId) : null;
      targets.push({ room, contract, chest: room.chestId ? await records.loadChest(p, level, room.chestId) : null });
    }
    return targets;
  })).value;
}
export async function act(command: ContentCommand) {
  const { head } = await readCanonicalHead(), request = worldRequest(head, 'content.command', encodeRoster(command));
  return { request, outcome: await executeContentCommand(request) };
}
// Test-only placement: runtime callers cannot choose an arbitrary checkpoint position.
export async function place(position: WorldPosition, mode: 'manual' | 'auto-play' | 'town' = 'manual') {
  return work(async tx => { const c = gameCheckpoint(tx.head.checkpoint); tx.setCheckpoint(checkpointJson({ ...c, position, mode })); return {}; });
}
export async function step(direction: 'north' | 'east' | 'south' | 'west') {
  return work(async tx => {
    const c = gameCheckpoint(tx.head.checkpoint), step = await resolveWorldStep(tx.pages, c.position, direction);
    if (step.moved) {
      await recordRoomQuestVisit(tx.pages, step.position, new Date().toISOString());
      tx.setCheckpoint(checkpointJson({ ...c, position: step.position, facing: direction }));
    }
    return json(step);
  });
}
