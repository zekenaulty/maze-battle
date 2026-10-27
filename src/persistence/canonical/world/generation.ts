import { bootstrapModule, proposeModuleStep } from '../../../domain/expedition/topology/modules/step';
import { validateModuleRecipe, type ModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { spaceOccupancy } from '../../../domain/expedition/topology/modules/placement';
import type { ModuleSocket } from '../../../domain/expedition/topology/modules/types';
import { boundsBuckets, neighborhood } from '../../topology/buckets';
import type { SpaceSpec } from '../../../domain/expedition/types';
import { world as gridPoint } from '../../../domain/expedition/topology/geometry';
import { alignedLowerFrame, STAIR_LAYOUT_VERSION, materializeStairRoom, type FloorFrame } from '../../../domain/expedition/vertical';
import type { CanonicalPages } from '../pages';
import { check, validId } from '../validation';
import { entityKey, fresh, json, levelKey, loadFloor, loadPorts, loadSpace, loadWorld, required } from './records';
import { loadOccupancy } from './occupancy';
import { requireWorldAnchor } from './residency';
import type { SpacePorts, WorldFloor, WorldSpace, WorldPosition } from './types';

const center = (space: SpaceSpec) => ({ spaceId: space.id, row: Math.floor(space.rows / 2), column: Math.floor(space.columns / 2) });
const socketKey = (level: number, sequence: number) => `${levelKey(level)}/frontier/${sequence}`;
interface StoredSocket { schema: 1; level: number; sequence: number; socket: ModuleSocket }

/** Called only by game-owned generation commands, in the same transaction as their receipt. */
export async function createWorldFloor(pages: CanonicalPages, recipe: ModuleRecipe) {
  validateModuleRecipe(recipe);
  recipe = structuredClone(recipe);
  check(validId(recipe.worldId) && recipe.floorId === `floor-${recipe.level}`, 'invalid canonical recipe identity');
  let upperExit: WorldPosition | undefined;
  let upperFrame: FloorFrame | undefined, upperPoint: { row: number; column: number } | undefined;
  if (recipe.level === 1) check(!await pages.get('world', 'dungeon'), 'world already exists');
  else {
    const world = await loadWorld(pages), upper = await loadFloor(pages, recipe.level - 1);
    check(world.worldId === recipe.worldId && upper.generation.recipe.worldId === world.worldId
      && world.deepestLevel + 1 === recipe.level && upper.exit, 'floor creation is not the next established frontier');
    await requireWorldAnchor(pages, { level: upper.level, cell: upper.exit });
    upperExit = { level: upper.level, cell: upper.exit };
    check(recipe.spatial === upper.generation.recipe.spatial, 'floor spatial profile must inherit its established parent');
    check(recipe.architecture === upper.generation.recipe.architecture, 'floor architecture must inherit its established parent');
    if (upper.spatial) {
      upperFrame = upper.spatial.frame;
      upperPoint = gridPoint((await loadSpace(pages, upper.level, upper.exit.spaceId)).value.spec, upper.exit);
    }
  }
  const initial = bootstrapModule(recipe), level = recipe.level;
  const { occupancy, stage } = await loadOccupancy(pages, level, initial.occupancy.flatMap(entry => boundsBuckets(entry.bounds)));
  for (const entry of initial.occupancy) occupancy.add(entry);
  const floor: WorldFloor = { schema: 1, level, generation: initial.state, nextPending: 0,
    entry: center(initial.space), farthest: { spaceId: initial.space.id, distance: 0 }, exit: null };
  if (recipe.spatial) floor.spatial = { version: STAIR_LAYOUT_VERSION, frame: upperFrame
    ? alignedLowerFrame(upperFrame, upperPoint!, gridPoint(initial.space, floor.entry)) : [0, 0, 0] };
  if (upperExit) await fresh(pages, `${levelKey(level - 1)}/stairs`, { schema: 1, upper: upperExit, lower: { level, cell: floor.entry },
    ...(upperFrame && floor.spatial ? { placement: { version: 'straight-stair-placement-v1', recipe: 'straight-stair-v1', upperFrame, lowerFrame: floor.spatial.frame } } : {}) });
  await fresh(pages, levelKey(level), floor, [`floors/${level}`]);
  await addSpace(pages, level, initial.space, 0, recipe.spatial && upperExit ? 'lower' : undefined);
  await pages.set('world', entityKey(level, 'ports', initial.space.id), json({ schema: 1, level,
    spaceId: initial.space.id, connections: [], pending: initial.pending.map(socket => socket.id) }));
  for (const [sequence, socket] of initial.pending.entries()) await fresh(pages, socketKey(level, sequence), { schema: 1, level, sequence, socket });
  await stage();
  await pages.set('world', 'dungeon', { schema: 1, worldId: recipe.worldId, deepestLevel: level });
  return floor;
}

/** One bounded module expansion, never a compile/scan of the retained world. */
export async function expandWorldFloor(pages: CanonicalPages, level: number, requestId: string) {
  const floor = await loadFloor(pages, level), g = floor.generation;
  check((await loadWorld(pages)).worldId === g.recipe.worldId, 'foreign floor recipe');
  if (floor.exit) return { floor, expanded: false };
  check(g.pendingCount > 0, 'module frontier exhausted before floor completion');
  const stored = await required<StoredSocket>(pages, socketKey(level, floor.nextPending));
  check(stored?.schema === 1 && stored.level === level && stored.sequence === floor.nextPending
    && stored.socket?.id === `socket-${floor.nextPending}`, 'invalid next module socket');
  const socket = stored.socket, source = (await loadSpace(pages, level, socket.sourceId)).value;
  const ports = new Map<string, SpacePorts>([[source.spec.id, await loadPorts(pages, level, source.spec.id)]]);
  check(ports.get(source.spec.id)!.pending.includes(socket.id), 'socket missing from its source');
  const point = { row: socket.room.origin.row + Math.floor(socket.room.rows / 2), column: socket.room.origin.column + Math.floor(socket.room.columns / 2) };
  const { occupancy, stage } = await loadOccupancy(pages, level, neighborhood(point));
  // Verify the exact reservation without removing it from the generator's collision view.
  occupancy.remove(socket.reservation); occupancy.add(socket.reservation);
  const delta = proposeModuleStep(g, socket, source.spec, (bounds, except) => occupancy.occupied(bounds, except), requestId);
  occupancy.remove(socket.reservation);
  for (const space of delta.spaces) {
    occupancy.add(spaceOccupancy(space));
    await addSpace(pages, level, space, source.distance + 1);
    ports.set(space.id, { schema: 1, level, spaceId: space.id, connections: [], pending: [] });
  }
  ports.get(source.spec.id)!.pending = ports.get(source.spec.id)!.pending.filter(id => id !== socket.id);
  for (const [index, pending] of delta.pending.entries()) {
    occupancy.add(pending.reservation); ports.get(pending.sourceId)!.pending.push(pending.id);
    const sequence = g.nextSequence + index;
    await fresh(pages, socketKey(level, sequence), { schema: 1, level, sequence, socket: pending });
  }
  for (const connection of delta.connections) {
    await fresh(pages, entityKey(level, 'connection', connection.id), { schema: 1, level, connection });
    for (const end of [connection.from, connection.to]) ports.get(end.spaceId)!.connections.push(connection.id);
  }
  for (const port of ports.values()) {
    check(port.connections.length + port.pending.length <= 4, 'too many module ports');
    await pages.set('world', entityKey(level, 'ports', port.spaceId), json(port));
  }
  await fresh(pages, entityKey(level, 'join', delta.join.id), { schema: 1, level, join: delta.join });
  await pages.delete('world', socketKey(level, floor.nextPending));
  await stage();
  const candidate = { spaceId: socket.room.id, distance: source.distance + 1 }, prior = floor.farthest;
  const farthest = candidate.distance > prior.distance || candidate.distance === prior.distance && candidate.spaceId < prior.spaceId ? candidate : prior;
  const generation = { ...g, revision: g.revision + 1, rooms: g.rooms + 1,
    nextSequence: g.nextSequence + delta.pending.length, pendingCount: g.pendingCount - 1 + delta.pending.length };
  const exit = generation.rooms === g.recipe.roomBudget ? center((await loadSpace(pages, level, farthest.spaceId)).value.spec) : null;
  if (exit && g.recipe.spatial) {
    const { value } = await loadSpace(pages, level, exit.spaceId);
    const stairwell = { version: STAIR_LAYOUT_VERSION, end: 'upper' as const };
    materializeStairRoom(value.spec, stairwell); // qualify the local bypass before the structural witness is built
    await pages.set('world', entityKey(level, 'space', exit.spaceId), json({ ...value, schematic: 'stair-room-v1', stairwell }), [`spaces/${level}/${exit.spaceId}`]);
  }
  const next: WorldFloor = { ...floor, generation, nextPending: floor.nextPending + 1, farthest, exit };
  await pages.set('world', levelKey(level), json(next), [`floors/${level}`]);
  return { floor: next, expanded: true, work: delta.work };
}

async function addSpace(pages: CanonicalPages, level: number, spec: SpaceSpec, distance: number, end?: 'lower') {
  const space: WorldSpace = { schema: 1, level, schematic: end ? 'stair-room-v1' : spec.interior ?? 'stone-room-v1', spec, distance,
    ...(end ? { stairwell: { version: STAIR_LAYOUT_VERSION, end } } : {}) };
  if (space.stairwell) materializeStairRoom(spec, space.stairwell);
  await fresh(pages, entityKey(level, 'space', spec.id), space, [`spaces/${level}/${spec.id}`]);
}
