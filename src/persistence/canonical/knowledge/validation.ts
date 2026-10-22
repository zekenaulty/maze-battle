import { fields, id, natural, timestamp } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import { position } from '../world/records';
import type { WorldPosition } from '../world/types';
import { DIRECTIONS, MAX_VISIBLE_CELLS, OBSERVATION_CHUNK_SIZE, VISION_RADIUS,
  type CellSource, type KnowledgeAnchor, type ObservationHeader, type ObservationRef, type ObservedCell } from './types';

export function observationRef(value: unknown): asserts value is ObservationRef {
  const r = fields(value, 'sequence id'); natural(r.sequence, 1); id(r.id);
}
export function knowledgeAnchor(value: unknown): asserts value is KnowledgeAnchor | null {
  if (value === null) return;
  const r = fields(value, 'sequence id witness'); observationRef({ sequence: r.sequence, id: r.id }); id(r.witness);
}
export function cellSource(value: unknown): asserts value is CellSource {
  const r = fields(value, 'sequence id index'); observationRef({ sequence: r.sequence, id: r.id });
  natural(r.index); check(r.index < MAX_VISIBLE_CELLS, 'invalid observation cell index');
}
export function cellPosition(value: unknown): asserts value is WorldPosition {
  const r = fields(value, 'level cell'); fields(r.cell, 'spaceId row column'); position(value as WorldPosition);
}
export function observedCell(value: unknown): asserts value is ObservedCell {
  const c = fields(value, 'at world edges chests stairs'); cellPosition(c.at);
  const point = fields(c.world, 'row column');
  check(Number.isSafeInteger(point.row) && Number.isSafeInteger(point.column), 'invalid observed coordinates');
  const edges = fields(c.edges, '', DIRECTIONS.join(' '));
  for (const target of Object.values(edges)) if (target !== null) cellPosition(target);
  check(Array.isArray(c.chests) && c.chests.length <= 1, 'invalid observed chests');
  for (const chest of c.chests) { const r = fields(chest, 'id opened'); id(r.id); check(typeof r.opened === 'boolean', 'invalid chest sight'); }
  check(Array.isArray(c.stairs) && c.stairs.length <= 2 && new Set(c.stairs).size === c.stairs.length
    && c.stairs.every(s => typeof s === 'string' && ['town', 'up', 'down'].includes(s)), 'invalid observed stairs');
}
export function observationHeader(value: unknown): ObservationHeader {
  jsonBytes(value);
  const r = fields(value, 'schema sequence previous owner epoch revision observedAt actor policy radius count chunks', 'spaces graph');
  check(r.schema === 1 && r.policy === 'linked-vision-v1' && r.radius === VISION_RADIUS, 'invalid observation policy');
  natural(r.sequence, 1); natural(r.epoch, 1); natural(r.revision, 1); id(r.owner); timestamp(r.observedAt); cellPosition(r.actor);
  if (r.previous !== null) observationRef(r.previous);
  check(r.sequence === 1 ? r.previous === null : r.previous?.sequence === r.sequence - 1, 'broken observation sequence');
  natural(r.count, 1); check(r.count <= MAX_VISIBLE_CELLS, 'observation exceeds cell bound');
  check(Array.isArray(r.chunks) && r.chunks.length === Math.ceil(r.count / OBSERVATION_CHUNK_SIZE)
    && new Set(r.chunks).size === r.chunks.length, 'invalid observation chunks'); r.chunks.forEach(id);
  if (r.spaces !== undefined || r.graph !== undefined) {
    check(r.graph === 'available', 'invalid observation graph availability');
    check(Array.isArray(r.spaces) && r.spaces.length > 0 && r.spaces.length <= 16, 'invalid observed spaces');
    const seen = new Set<string>();
    for (const value of r.spaces) {
      const s = fields(value, 'spaceId kind index'); id(s.spaceId); natural(s.index);
      check((s.kind === 'room' || s.kind === 'passage') && s.index < r.count && !seen.has(s.spaceId), 'invalid observed classification');
      seen.add(s.spaceId);
    }
  }
  return value as ObservationHeader;
}
