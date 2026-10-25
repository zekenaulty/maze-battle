import { boundary, world } from '../../../domain/expedition/topology/geometry';
import type { TopologyConnection } from '../../../domain/expedition/topology/types';
import { movePosition, opposite } from '../../../domain/maze/movement';
import type { Direction } from '../../../domain/types';
import type { CanonicalPages } from '../pages';
import { check, isObject, validId } from '../validation';
import { address, entityKey, json, levelKey, loadFloor, loadPorts, loadSpace, loadWorld, position, required, same } from './records';
import type { WorldMutation, WorldPosition, WorldRead, WorldStairs } from './types';
import { loadPlacedStairs } from './placedStairs';

const directions = ['north', 'east', 'south', 'west'];
const localCell = (point: { row: number; column: number }) => ({ row: point.row, column: point.column });

/** Engine-only resident geometry. Never use this as an agent/human knowledge projection. */
export async function loadWorldRoom(pages: WorldRead, level: number, id: string) {
  const floor = await loadFloor(pages, level);
  check(floor.generation.recipe.worldId === (await loadWorld(pages)).worldId, 'foreign floor recipe');
  const { value, geometry } = await loadSpace(pages, level, id), ports = await loadPorts(pages, level, id);
  const stairEnd = floor.exit?.spaceId === id ? 'upper' : level > 1 && floor.entry.spaceId === id ? 'lower' : undefined;
  check(value.stairwell ? floor.spatial?.version === value.stairwell.version && stairEnd === value.stairwell.end
    : !floor.spatial || !stairEnd, 'stair-room role differs from pinned floor anchors');
  const connections: TopologyConnection[] = [], usedDirections = new Set<string>();
  for (const connectionId of ports.connections) {
    const row = await required<{ schema: number; level: number; connection: TopologyConnection }>(pages, entityKey(level, 'connection', connectionId));
    const link = row?.connection;
    check(row?.schema === 1 && row.level === level && link?.id === connectionId
      && directions.includes(link.direction), 'invalid committed connection');
    address(link.from); address(link.to);
    check(link.from.spaceId !== link.to.spaceId && (link.from.spaceId === id || link.to.spaceId === id), 'foreign connection endpoint');
    const forward = link.from.spaceId === id, endpoint = forward ? link.from : link.to, direction = forward ? link.direction : opposite(link.direction);
    check(!usedDirections.has(direction) && same(localCell(endpoint), boundary(value.spec, direction)), 'invalid or duplicate boundary port');
    usedDirections.add(direction); connections.push(link);
  }
  return { space: value, geometry, ports, connections };
}

/** Resolves geometry only; mandatory game effects/observations are committed by the caller. No loot or generation. */
export async function resolveWorldStep(pages: WorldRead, from: WorldPosition, direction: Direction) {
  position(from); check(directions.includes(direction), 'invalid movement direction');
  from = structuredClone(from);
  const source = await loadWorldRoom(pages, from.level, from.cell.spaceId);
  const cell = source.geometry.cells.find(value => same(localCell(value), localCell(from.cell)));
  check(cell, 'actor is outside established walkable geometry');
  if (cell.links.includes(direction)) return { position: { level: from.level, cell: { ...movePosition(from.cell, direction), spaceId: from.cell.spaceId } }, moved: true, crossed: false };
  const link = source.connections.find(value => {
    const forward = value.from.spaceId === from.cell.spaceId;
    return (forward ? value.direction : opposite(value.direction)) === direction
      && same(forward ? value.from : value.to, from.cell);
  });
  if (!link) return { position: structuredClone(from), moved: false, crossed: false };
  const target = link.from.spaceId === from.cell.spaceId ? link.to : link.from;
  const destination = await loadWorldRoom(pages, from.level, target.spaceId);
  check(destination.connections.some(value => value.id === link.id && same(value, link))
    && destination.geometry.cells.some(value => same(localCell(value), localCell(target)))
    && same(world(destination.space.spec, target), movePosition(world(source.space.spec, from.cell), direction)),
  'committed doorway lacks reciprocal adjacent walkable endpoint');
  return { position: { level: from.level, cell: { ...target } }, moved: true, crossed: true };
}

/** Returns a preparation requirement only for a genuinely ungenerated next floor. */
export async function resolveFloorTravel(pages: WorldRead, from: WorldPosition, direction: 'up' | 'down') {
  position(from); check(direction === 'up' || direction === 'down', 'invalid stair direction');
  from = structuredClone(from);
  const floor = await loadFloor(pages, from.level), anchor = direction === 'up' ? floor.entry : floor.exit;
  check(anchor && same(anchor, from.cell), 'actor is not on these stairs');
  await requireWorldAnchor(pages, from);
  if (direction === 'up' && from.level === 1) return { kind: 'town' as const, returnPosition: structuredClone(from) };
  const upperLevel = direction === 'up' ? from.level - 1 : from.level;
  const header = await loadWorld(pages);
  if (direction === 'down' && header.deepestLevel === from.level) return { kind: 'prepare' as const, level: from.level + 1 };
  const stairs = await required<WorldStairs>(pages, `${levelKey(upperLevel)}/stairs`);
  check(stairs?.schema === 1, 'invalid floor connection'); position(stairs.upper); position(stairs.lower);
  const upper = await loadFloor(pages, upperLevel), lower = await loadFloor(pages, upperLevel + 1);
  check(stairs.upper.level === upperLevel && stairs.lower.level === upperLevel + 1
    && upper.generation.recipe.worldId === header.worldId && lower.generation.recipe.worldId === header.worldId
    && same(stairs.upper.cell, upper.exit) && same(stairs.lower.cell, lower.entry)
    && same(direction === 'up' ? stairs.lower : stairs.upper, from), 'floor connection is not reciprocal');
  const target = direction === 'up' ? stairs.upper : stairs.lower;
  if (upper.spatial || lower.spatial || stairs.placement) await loadPlacedStairs(pages, upperLevel, stairs);
  await requireWorldAnchor(pages, target);
  return { kind: 'dungeon' as const, position: structuredClone(target) };
}

export async function requireWorldAnchor(pages: WorldRead, at: WorldPosition) {
  position(at);
  const room = await loadWorldRoom(pages, at.level, at.cell.spaceId);
  check(room.geometry.cells.some(value => same(localCell(value), localCell(at.cell))), 'world anchor is outside established walkable geometry');
}

/** Domain-owned mutation staging, not an exposed interaction or auto-loot policy. */
export async function storeWorldMutation(pages: CanonicalPages, value: WorldMutation) {
  check(value?.schema === 1 && validId(value.entityId) && ['chest', 'mechanism', 'hazard', 'encounter'].includes(value.kind)
    && isObject(value.state), 'invalid world mutation');
  value = structuredClone(value);
  await loadSpace(pages, value.level, value.spaceId);
  const key = `${entityKey(value.level, 'mutation', value.spaceId)}/${value.entityId}`;
  const prior = await pages.get('world', key);
  check(!prior || (prior.value as unknown as WorldMutation).kind === value.kind, 'world mutation kind changed');
  await pages.set('world', key, json(value), [`mutations/${value.level}/${value.spaceId}/${value.entityId}`]);
}
