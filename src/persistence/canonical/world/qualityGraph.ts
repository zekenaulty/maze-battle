import { connection, world } from '../../../domain/expedition/topology/geometry';
import { keyedSeed } from '../../../domain/expedition/topology/seed';
import type { ModuleJoin } from '../../../domain/expedition/topology/modules/types';
import type { TopologyConnection } from '../../../domain/expedition/topology/types';
import { movePosition, opposite } from '../../../domain/maze/movement';
import { check, integer } from '../validation';
import { entityKey, loadPorts, loadSpace, same } from './records';
import { qualityFields, qualityOrdinal, qualityRoomId, type QualityContext, type QualityWitness } from './qualityRecords';
import type { WorldRead } from './types';

/** At most one room, four neighbors and four passages, never a floor graph. */
export async function readQualityRoom(pages: WorldRead, context: QualityContext, ordinal: number) {
  const { floor } = context, { recipe, rooms } = floor.generation, level = floor.level;
  const versions = new Map<string, string>();
  const tracked: WorldRead = { scan: () => { throw Error('Quality must not scan'); }, get: async (area, key) => {
    const row = await pages.get(area, key);
    check(row, `missing established world record: ${key}`); versions.set(key, row.id); return row;
  } };
  const locals = new Map<string, { space: Awaited<ReturnType<typeof loadSpace>>; ports: Awaited<ReturnType<typeof loadPorts>> }>();
  const local = async (id: string, kind: 'room' | 'passage') => {
    let found = locals.get(id);
    if (!found) {
      found = { space: await loadSpace(tracked, level, id), ports: await loadPorts(tracked, level, id) };
      locals.set(id, found);
    }
    const { spec, distance } = found.space.value;
    check(spec.kind === kind && spec.seed === keyedSeed(recipe.seed, id)
      && (id === 'entry' ? distance === 0 : integer(distance, 1) && distance < rooms), 'invalid quality space binding');
    check(found.ports.pending.length === 0 && found.ports.connections.length >= 1, 'invalid completed quality ports');
    if (kind === 'room') check([spec.rows, spec.columns].every(side => side >= recipe.policy.minSide
      && side <= recipe.policy.maxSide && side % 2 === 1), 'invalid quality room dimensions');
    for (const anchor of [floor.entry, floor.exit!]) if (anchor.spaceId === id) {
      check(anchor.row === Math.floor(spec.rows / 2) && anchor.column === Math.floor(spec.columns / 2), 'invalid quality floor anchor');
    }
    return found;
  };
  const witness = (id: string): QualityWitness => ({ space: versions.get(entityKey(level, 'space', id))!,
    ports: versions.get(entityKey(level, 'ports', id))!, join: id === 'entry' ? null
      : versions.get(entityKey(level, 'join', `socket-${qualityOrdinal(id, rooms) - 1}`))! });
  const edge = async (id: string, from: Awaited<ReturnType<typeof local>>, to: Awaited<ReturnType<typeof local>>, direction: ModuleJoin['direction']) => {
    const row = await tracked.get('world', entityKey(level, 'connection', id));
    qualityFields(row!.value, 'connection,level,schema');
    const stored = row!.value as unknown as { schema: number; level: number; connection: TopologyConnection };
    const expected = connection(id, from.space.value.spec, to.space.value.spec, direction);
    check(stored.schema === 1 && stored.level === level && same(stored.connection, expected)
      && from.ports.connections.includes(id) && to.ports.connections.includes(id)
      && same(movePosition(world(from.space.value.spec, expected.from), direction), world(to.space.value.spec, expected.to)),
    'quality join lacks reciprocal adjacent endpoints');
  };
  const id = qualityRoomId(ordinal), current = await local(id, 'room');
  const children: { ordinal: number; witness: QualityWitness; degree: number }[] = [];
  const directions = new Set<string>(), joins = new Set<string>();
  let parent: number | null = null;
  for (const linkId of current.ports.connections) {
    const match = /^socket-(0|[1-9]\d*):(door|entrance|exit)$/.exec(linkId);
    check(match, 'invalid quality connection identity');
    const joinId = `socket-${match[1]}`, row = await tracked.get('world', entityKey(level, 'join', joinId));
    qualityFields(row!.value, 'join,level,schema');
    const stored = row!.value as unknown as { schema: number; level: number; join: ModuleJoin }, join = stored.join;
    qualityFields(join, join?.passageId === undefined ? 'direction,fromRoomId,id,toRoomId' : 'direction,fromRoomId,id,passageId,toRoomId');
    check(stored.schema === 1 && stored.level === level && join.id === joinId && !joins.has(joinId)
      && ['north', 'east', 'south', 'west'].includes(join.direction), 'invalid quality join');
    joins.add(joinId);
    const fromOrdinal = qualityOrdinal(join.fromRoomId, rooms), toOrdinal = qualityOrdinal(join.toRoomId, rooms);
    check(join.toRoomId === `${joinId}:room` && fromOrdinal < toOrdinal
      && (id === join.fromRoomId || id === join.toRoomId), 'quality joins are not an ordered tree');
    const forward = id === join.fromRoomId, direction = forward ? join.direction : opposite(join.direction);
    check(!directions.has(direction), 'duplicate quality boundary direction'); directions.add(direction);
    check(linkId === `${joinId}:${join.passageId ? forward ? 'entrance' : 'exit' : 'door'}`, 'quality port disagrees with join');
    const from = await local(join.fromRoomId, 'room'), to = await local(join.toRoomId, 'room');
    check(to.space.value.distance === from.space.value.distance + 1, 'invalid quality tree distance');
    if (join.passageId) {
      check(join.passageId === `${joinId}:passage` && recipe.policy.joins !== 'direct', 'invalid quality passage binding');
      const passage = await local(join.passageId, 'passage'), spec = passage.space.value.spec;
      const vertical = join.direction === 'north' || join.direction === 'south';
      check((vertical ? spec.columns : spec.rows) === 1 && (vertical ? spec.rows : spec.columns) <= recipe.policy.maxPassage
        && passage.space.value.distance === to.space.value.distance
        && same([...passage.ports.connections].sort(), [`${joinId}:entrance`, `${joinId}:exit`]), 'invalid quality passage ports');
      await edge(`${joinId}:entrance`, from, passage, join.direction);
      await edge(`${joinId}:exit`, passage, to, join.direction);
    } else {
      check(recipe.policy.joins !== 'passage', 'missing required quality passage');
      await edge(`${joinId}:door`, from, to, join.direction);
    }
    if (forward) children.push({ ordinal: toOrdinal, witness: witness(join.toRoomId), degree: to.ports.connections.length });
    else { check(parent === null, 'multiple quality parents'); parent = fromOrdinal; }
  }
  check(ordinal === 0 ? parent === null : parent !== null, 'missing quality tree parent');
  return { ordinal, parent, degree: current.ports.connections.length, children, witness: witness(id) };
}
