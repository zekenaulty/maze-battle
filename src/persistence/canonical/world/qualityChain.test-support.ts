import { connection } from '../../../domain/expedition/topology/geometry';
import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { moduleSpace } from '../../../domain/expedition/topology/modules/placement';
import { keyedSeed } from '../../../domain/expedition/topology/seed';
import { qualityRoomId } from './qualityRecords';

/** Deliberately bad but complete connected topology, generated lazily for bound tests. */
export function chainRecords(count: number) {
  const recipe = { ...createModuleRecipe('quality-chain', 1, 42), roomBudget: count };
  recipe.policy = { ...recipe.policy, minSide: 5, maxSide: 5, joins: 'direct' };
  const spec = (ordinal: number) => moduleSpace(qualityRoomId(ordinal), 'room',
    { row: 0, column: ordinal * 5, rows: 5, columns: 5 }, keyedSeed(42, qualityRoomId(ordinal)));
  const join = (ordinal: number) => ({ id: `socket-${ordinal}`, fromRoomId: qualityRoomId(ordinal),
    toRoomId: qualityRoomId(ordinal + 1), direction: 'east' as const });
  const link = (ordinal: number) => connection(`socket-${ordinal}:door`, spec(ordinal), spec(ordinal + 1), 'east');
  const floor = { schema: 1, level: 1, generation: { recipe, scopeId: JSON.stringify(recipe), rooms: count,
    revision: count - 1, pendingCount: 0, nextSequence: count - 1 }, nextPending: count - 1,
    entry: { spaceId: 'entry', row: 2, column: 2 }, exit: { spaceId: qualityRoomId(count - 1), row: 2, column: 2 },
    farthest: { spaceId: qualityRoomId(count - 1), distance: count - 1 } };
  const read = (key: string) => {
    if (key === 'dungeon') return { schema: 1, worldId: recipe.worldId, deepestLevel: 1 };
    if (key === 'dungeon/1') return floor;
    const match = /^dungeon\/1\/(space|ports|join|connection)\/(entry|socket-(\d+)(?::room|:door)?)$/.exec(key);
    if (!match) return undefined;
    const [, kind, id, sequence] = match, ordinal = id === 'entry' ? 0 : Number(sequence) + Number(kind === 'space' || kind === 'ports');
    if (ordinal >= count || ordinal < 0) return undefined;
    switch (kind) {
      case 'space': return { schema: 1, level: 1, schematic: 'stone-room-v1', spec: spec(ordinal), distance: ordinal };
      case 'ports': return { schema: 1, level: 1, spaceId: id, pending: [], connections:
        [...(ordinal > 0 ? [`socket-${ordinal - 1}:door`] : []), ...(ordinal < count - 1 ? [`socket-${ordinal}:door`] : [])] };
      case 'join': return { schema: 1, level: 1, join: join(ordinal) };
      case 'connection': return { schema: 1, level: 1, connection: link(ordinal) };
    }
  };
  const assembly = () => ({ recipe, scopeId: floor.generation.scopeId, revision: count - 1, rooms: count,
    nextSequence: count - 1, spaces: Array.from({ length: count }, (_, i) => spec(i)),
    joins: Array.from({ length: count - 1 }, (_, i) => join(i)), connections: Array.from({ length: count - 1 }, (_, i) => link(i)), pending: [] });
  return { read, assembly };
}
