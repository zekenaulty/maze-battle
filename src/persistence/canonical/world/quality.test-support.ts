import { ModuleAssembly } from '../../../domain/expedition/topology/modules/assembly';
import { createModuleRecipe, type ModulePolicy } from '../../../domain/expedition/topology/modules/policy';
import type { CanonicalPages } from '../pages';
import type { CanonicalRecord } from '../types';
import { advanceWorldFloorQuality, beginWorldFloorQuality } from './quality';

export function qualityMemory() {
  const rows = new Map<string, CanonicalRecord>(), reads: string[] = [], writes: string[] = [];
  let fallback: (key: string) => unknown = () => undefined;
  const put = (key: string, value: unknown) => {
    const row = { id: crypto.randomUUID(), value: structuredClone(value) } as CanonicalRecord;
    rows.set(key, row); return row;
  };
  const pages = {
    get: async (_area: string, key: string) => {
      reads.push(key);
      const value = fallback(key);
      return structuredClone(rows.get(key) ?? (value === undefined ? undefined : { id: key.replaceAll('/', ':'), value }));
    },
    set: async (_area: string, key: string, value: unknown) => { writes.push(key); return put(key, value); },
    scan: async () => { throw Error('Quality must not scan'); },
  } as unknown as CanonicalPages;
  return { pages, rows, reads, writes, put, value: (key: string) => rows.get(key)!.value as any,
    clear: () => { reads.length = 0; writes.length = 0; }, fallback: (get: typeof fallback) => { fallback = get; } };
}

export function qualityFixture(seed = 781, count = 25, joins: ModulePolicy['joins'] = 'mixed') {
  const m = qualityMemory(), recipe = { ...createModuleRecipe('quality-unit', 1, seed), roomBudget: count };
  recipe.policy.joins = joins;
  const assembly = new ModuleAssembly(recipe).finish(), distances = new Map([['entry', 0]]);
  for (const join of assembly.joins) {
    distances.set(join.toRoomId, distances.get(join.fromRoomId)! + 1);
    if (join.passageId) distances.set(join.passageId, distances.get(join.toRoomId)!);
    m.put(`dungeon/1/join/${join.id}`, { schema: 1, level: 1, join });
  }
  const rooms = assembly.spaces.filter(space => space.kind === 'room');
  const farthest = [...rooms].sort((a, b) => distances.get(b.id)! - distances.get(a.id)! || a.id.localeCompare(b.id))[0];
  const center = (id: string) => {
    const spec = rooms.find(space => space.id === id)!;
    return { spaceId: id, row: Math.floor(spec.rows / 2), column: Math.floor(spec.columns / 2) };
  };
  m.put('dungeon', { schema: 1, worldId: recipe.worldId, deepestLevel: 1 });
  m.put('dungeon/1', { schema: 1, level: 1, generation: { recipe, scopeId: assembly.scopeId,
    rooms: count, revision: count - 1, pendingCount: 0, nextSequence: count - 1 }, nextPending: count - 1,
    entry: center('entry'), exit: center(farthest.id), farthest: { spaceId: farthest.id, distance: distances.get(farthest.id) } });
  for (const spec of assembly.spaces) {
    m.put(`dungeon/1/space/${spec.id}`, { schema: 1, level: 1, schematic: 'stone-room-v1', spec, distance: distances.get(spec.id) });
    m.put(`dungeon/1/ports/${spec.id}`, { schema: 1, level: 1, spaceId: spec.id, pending: [],
      connections: assembly.connections.filter(link => link.from.spaceId === spec.id || link.to.spaceId === spec.id).map(link => link.id) });
  }
  for (const connection of assembly.connections) m.put(`dungeon/1/connection/${connection.id}`, { schema: 1, level: 1, connection });
  return { ...m, assembly };
}

export async function finishQuality(m: ReturnType<typeof qualityMemory>, limit = 4) {
  let state = await beginWorldFloorQuality(m.pages, 1);
  for (let i = 0; i < 1024 && state.status === 'running'; i++) state = await advanceWorldFloorQuality(m.pages, 1, limit);
  if (state.status === 'running') throw Error('Unit fixture exceeded batch bound');
  return state;
}
