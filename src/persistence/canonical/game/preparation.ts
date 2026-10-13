import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { fields } from '../roster/codec';
import { executeCanonical } from '../transaction';
import type { CanonicalRequest } from '../types';
import type { WorldRead } from '../world/types';
import { check } from '../validation';
import { createWorldFloor, expandWorldFloor } from '../world/generation';
import { json, loadFloor, loadWorld, same } from '../world/records';
import { beginWorldFloorQuality, advanceWorldFloorQuality } from '../world/quality';
import { beginWorldRoomRoles, advanceWorldRoomRoles } from '../world/roles';
import { beginWorldContent, advanceWorldContent, requireWorldContent } from '../content/preparation';
import { gameCheckpoint } from './checkpoint';

export type PreparationPhase = 'generation' | 'quality' | 'roles' | 'content' | 'ready';
const key = (level: number) => `game/preparation/${level}`;
export async function readPreparation(pages: WorldRead, level: number): Promise<PreparationPhase> {
  const row = await pages.get('world', key(level));
  check(row, 'missing established floor preparation');
  const value = fields(row.value, 'schema level phase');
  check(value.schema === 1 && value.level === level && ['generation', 'quality', 'roles', 'content', 'ready'].includes(value.phase as string),
    'invalid floor preparation');
  return value.phase as PreparationPhase;
}
/** Each receipt advances one bounded module or qualification batch, never a floor-sized transaction. */
export function prepareGameFloor(request: CanonicalRequest) {
  check(request.operation === 'game.prepare', 'invalid preparation operation');
  return executeCanonical(request, async tx => {
    const input = fields(request.input, 'level'), c = gameCheckpoint(tx.head.checkpoint), level = input.level as number;
    check(level === c.position.level || level === c.position.level + 1, 'preparation outside the local floor boundary');
    if (level !== c.position.level) {
      const here = await loadFloor(tx.pages, c.position.level);
      check(here.exit && same(here.exit, c.position.cell), 'prepare the next floor only at descending stairs');
      const world = await loadWorld(tx.pages);
      if (world.deepestLevel < level) {
        await createWorldFloor(tx.pages, createModuleRecipe(world.worldId, level, here.generation.recipe.seed + 1));
        await tx.pages.set('world', key(level), { schema: 1, level, phase: 'generation' });
      }
    }
    let phase = await readPreparation(tx.pages, level);
    if (phase === 'ready') { await requireWorldContent(tx.pages, level); return { level, phase }; }
    if (phase === 'generation') {
      const { floor } = await expandWorldFloor(tx.pages, level, request.attemptId);
      if (floor.exit) { await beginWorldFloorQuality(tx.pages, level); phase = 'quality'; }
    } else if (phase === 'quality') {
      const result = await advanceWorldFloorQuality(tx.pages, level);
      check(result.status !== 'failed', 'dungeon failed structural qualification');
      if (result.status === 'qualified') { await beginWorldRoomRoles(tx.pages, level); phase = 'roles'; }
    } else if (phase === 'roles') {
      if ((await advanceWorldRoomRoles(tx.pages, level)).plan) { await beginWorldContent(tx.pages, level); phase = 'content'; }
    } else {
      const result = await advanceWorldContent(tx.pages, level);
      if (result.nextRoom === result.binding.roomCount) phase = 'ready';
    }
    await tx.pages.set('world', key(level), { schema: 1, level, phase });
    return json({ level, phase });
  });
}
