import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { materializeSpace } from '../../../domain/expedition/schematic';
import { validateModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import type { CellAddress } from '../../../domain/expedition/types';
import type { CanonicalPages } from '../pages';
import type { Json } from '../types';
import { check, integer, jsonBytes, validId } from '../validation';
import type { SpacePorts, WorldFloor, WorldHeader, WorldRead, WorldSpace, WorldPosition } from './types';

export const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
export function levelKey(level: number) { check(integer(level, 1), 'invalid dungeon level'); return `dungeon/${level}`; }
export function entityKey(level: number, kind: string, id: string) { check(validId(id), 'invalid world record ID'); return `${levelKey(level)}/${kind}/${id}`; }
export function json(value: unknown): Json { jsonBytes(value); return value as Json; }
export async function required<T>(pages: WorldRead, key: string): Promise<T> {
  const row = await pages.get('world', key); check(row, `missing established world record: ${key}`);
  return row.value as T;
}
export async function fresh(pages: CanonicalPages, key: string, value: unknown, indexes: string[] = []) {
  check(!await pages.get('world', key), `world record already exists: ${key}`);
  await pages.set('world', key, json(value), indexes);
}
export function address(value: CellAddress) {
  check(value && validId(value.spaceId) && integer(value.row) && integer(value.column)
    && value.row < 512 && value.column < 512, 'invalid cell address');
}
export function position(value: WorldPosition) { check(value, 'missing world position'); levelKey(value.level); address(value.cell); }
export async function loadWorld(pages: WorldRead) {
  const value = await required<WorldHeader>(pages, 'dungeon');
  check(value?.schema === 1 && validId(value.worldId) && integer(value.deepestLevel, 1), 'invalid world header');
  return value;
}
export async function loadFloor(pages: WorldRead, level: number) {
  const value = await required<WorldFloor>(pages, levelKey(level));
  check(value?.schema === 1 && value.level === level, 'invalid floor identity');
  const g = value.generation; validateModuleRecipe(g?.recipe);
  check(validId(g.recipe.worldId) && g.recipe.level === level && g.recipe.floorId === `floor-${level}`
    && g.scopeId === JSON.stringify(g.recipe), 'invalid pinned floor recipe');
  check(integer(g.revision) && integer(g.rooms, 1) && g.rooms <= g.recipe.roomBudget && g.revision === g.rooms - 1
    && integer(g.nextSequence) && integer(g.pendingCount) && integer(value.nextPending)
    && value.nextPending === g.revision && g.nextSequence === value.nextPending + g.pendingCount
    && g.rooms + g.pendingCount <= g.recipe.roomBudget, 'invalid floor frontier counters');
  address(value.entry);
  check(value.entry.spaceId === 'entry' && value.farthest && validId(value.farthest.spaceId)
    && integer(value.farthest.distance) && value.farthest.distance < g.rooms, 'invalid floor anchors');
  check((value.exit !== null) === (g.rooms === g.recipe.roomBudget), 'incomplete floor exit');
  if (value.exit) { address(value.exit); check(value.exit.spaceId === value.farthest.spaceId, 'changed floor exit'); }
  return value;
}
export async function loadSpace(pages: WorldRead, level: number, id: string) {
  const value = await required<WorldSpace>(pages, entityKey(level, 'space', id));
  check(value?.schema === 1 && value.level === level && value.schematic === 'stone-room-v1'
    && value.spec?.id === id && integer(value.distance), 'invalid space identity');
  check(value.spec.openings.length === 0 && value.spec.chests.length === 0, 'geometry contains mutable entities or connections');
  const geometry = materializeSpace(value.spec);
  return { value, geometry };
}
export async function loadPorts(pages: WorldRead, level: number, id: string) {
  const value = await required<SpacePorts>(pages, entityKey(level, 'ports', id));
  check(value?.schema === 1 && value.level === level && value.spaceId === id
    && Array.isArray(value.connections) && Array.isArray(value.pending)
    && value.connections.length + value.pending.length <= 4
    && [...value.connections, ...value.pending].every(validId)
    && new Set(value.connections).size === value.connections.length && new Set(value.pending).size === value.pending.length,
  'invalid bounded space ports');
  return value;
}
