import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { fields } from '../roster/codec';
import { executeCanonical, type CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import type { WorldRead } from '../world/types';
import { check } from '../validation';
import { createWorldFloor, expandWorldFloor } from '../world/generation';
import { loadFloor, loadWorld, same } from '../world/records';
import { beginWorldFloorQuality, advanceWorldFloorQuality } from '../world/quality';
import { beginWorldRoomRoles, advanceWorldRoomRoles } from '../world/roles';
import { beginWorldContent, advanceWorldContent, requireWorldContent } from '../content/preparation';
import { gameCheckpoint } from './checkpoint';
import { currentFloorPreparationSpec, preparationWorldWrite } from './floorCapacity';
import { validateKnowledge } from '../knowledge/evidence';
import { currentBattle } from '../combat/coherence';

export type PreparationPhase = 'generation' | 'quality' | 'roles' | 'content' | 'ready';
const key = (level: number) => `game/preparation/${level}`;
export async function findPreparation(pages: WorldRead, level: number): Promise<PreparationPhase | null> {
  const row = await pages.get('world', key(level));
  if (!row) return null;
  const value = fields(row.value, 'schema level phase');
  check(value.schema === 1 && value.level === level && ['generation', 'quality', 'roles', 'content', 'ready'].includes(value.phase as string),
    'invalid floor preparation');
  return value.phase as PreparationPhase;
}
export async function readPreparation(pages: WorldRead, level: number): Promise<PreparationPhase> {
  const phase = await findPreparation(pages, level);
  check(phase, 'missing established floor preparation');
  return phase;
}
/** Each receipt advances one bounded module or qualification batch, never a floor-sized transaction. */
export function prepareGameFloor(request: CanonicalRequest, options: { signal?: AbortSignal } = {}) {
  check(request.operation === 'game.prepare', 'invalid preparation operation');
  return executeCanonical(request, tx => commitFloorPreparation(tx, request.input, request.attemptId), options);
}

export async function commitFloorPreparation(tx: CanonicalWork, input: unknown, attemptId: string) {
  const args = fields(input, 'level', 'visibleStairs'), c = gameCheckpoint(tx.head.checkpoint), level = args.level as number;
  check(args.visibleStairs === undefined || args.visibleStairs === true, 'invalid stair preparation policy');
  check(level === c.position.level || level === c.position.level + 1, 'preparation outside the local floor boundary');
  check(!await currentBattle(tx.pages, c), 'floor preparation is unavailable during battle');
  let batch: { close(): void } | undefined;
  if (level !== c.position.level) {
    const here = await loadFloor(tx.pages, c.position.level);
    if (!(here.exit && same(here.exit, c.position.cell))) {
      check(args.visibleStairs === true && here.spatial && here.exit && c.mode !== 'town' && c.knowledge,
        'prepare the next floor only at descending stairs or their visible room');
      const sight = await validateKnowledge(tx.pages, c.knowledge);
      check(sight && same(sight.header.actor, c.position) && (here.exit.spaceId === c.position.cell.spaceId
        || sight.cells.some(cell => cell.at.level === here.level && cell.at.cell.spaceId === here.exit!.spaceId)),
      'descending stair room is outside current sight');
    }
    const world = await loadWorld(tx.pages);
    if (world.deepestLevel < level) {
      const recipe = createModuleRecipe(world.worldId, level, (here.generation.recipe.seed + 1) >>> 0, { spatial: !!here.generation.recipe.spatial });
      batch = await tx.privatePreparation(await currentFloorPreparationSpec(tx.pages, recipe), preparationWorldWrite(level));
      await createWorldFloor(tx.pages, recipe);
      await tx.pages.set('world', key(level), { schema: 1, level, phase: 'generation' });
    }
  }
  let phase = await readPreparation(tx.pages, level);
  if (phase === 'ready') { await requireWorldContent(tx.pages, level); return { level, phase }; }
  if (!batch) batch = await tx.privatePreparation(await currentFloorPreparationSpec(tx.pages, (await loadFloor(tx.pages, level)).generation.recipe),
    preparationWorldWrite(level));
  if (phase === 'generation') {
    const { floor } = await expandWorldFloor(tx.pages, level, attemptId);
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
  if (phase === 'ready') batch.close();
  return { level, phase };
}
