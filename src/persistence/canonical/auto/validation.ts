import { fields, id, natural, text } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import { cellPosition, observationRef } from '../knowledge/validation';
import { DIRECTIONS } from '../knowledge/types';
import { same } from '../world/records';
import type { KnownStep } from '../knowledge/navigation';
import type { AutoRoom, AutoState } from './types';
import type { WorldPosition } from '../world/types';

export function validateStep(value: unknown): asserts value is KnownStep {
  const r = fields(value, 'from to direction'); cellPosition(r.from); cellPosition(r.to);
  check(r.from.level === r.to.level && DIRECTIONS.some(d => d === r.direction) && !same(r.from, r.to), 'invalid Auto step');
}
export function validateAutoState(value: unknown): asserts value is AutoState {
  jsonBytes(value, 32 * 1024);
  const r = fields(value, 'schema level runId rootId lastPosition lastRevision status reason objective route search descent completed townServiced');
  check(r.schema === 1, 'invalid Auto schema'); natural(r.level, 1); id(r.runId); id(r.rootId); natural(r.lastRevision);
  cellPosition(r.lastPosition); check(r.lastPosition.level === r.level, 'foreign Auto position'); text(r.reason, 512);
  check(['running', 'town', 'blocked'].some(s => s === r.status) && typeof r.completed === 'boolean' && typeof r.townServiced === 'boolean', 'invalid Auto status');
  if (r.objective !== null) {
    const o = fields(r.objective, 'id roomId kind'); id(o.id); id(o.roomId);
    check(o.kind === 'quest' || o.kind === 'exit', 'invalid Auto objective');
  }
  if (r.descent !== null) { cellPosition(r.descent); check(r.descent.level === r.level, 'foreign Auto stairs'); }
  if (r.search !== null) {
    const s = fields(r.search, 'objectiveId fromId seekId childId'); id(s.objectiveId); id(s.fromId); id(s.seekId);
    if (s.childId !== null) id(s.childId);
    check(r.objective && s.objectiveId === fields(r.objective, 'id roomId kind').id, 'orphan Auto room search');
  }
  if (r.route !== null) {
    const p = fields(r.route, 'source target purpose steps'); observationRef(p.source); cellPosition(p.target);
    check(p.target.level === r.level && ['objective', 'explore', 'backtrack', 'exit'].some(s => s === p.purpose)
      && Array.isArray(p.steps) && p.steps.length > 0 && p.steps.length <= 64, 'invalid Auto route');
    let previous: WorldPosition = r.lastPosition;
    for (const step of p.steps) { validateStep(step); check(same(previous, step.from), 'discontinuous Auto route'); previous = step.to; }
  }
}
export function validateAutoRoom(value: unknown): asserts value is AutoRoom {
  jsonBytes(value, 4096);
  const r = fields(value, 'schema level spaceId runId depth parent completed closed');
  check(r.schema === 1 && typeof r.closed === 'boolean', 'invalid Auto room'); natural(r.level, 1); natural(r.depth); id(r.spaceId); id(r.runId);
  check(Array.isArray(r.completed) && r.completed.length <= 4 && new Set(r.completed).size === r.completed.length, 'unbounded completed exits');
  r.completed.forEach(id);
  if (r.parent !== null) {
    validateStep(r.parent);
    check(r.depth > 0 && r.parent.from.level === r.level && r.parent.from.cell.spaceId === r.spaceId
      && r.parent.to.cell.spaceId !== r.spaceId && !r.completed.includes(r.parent.to.cell.spaceId), 'invalid Auto parent');
  } else check(r.depth === 0, 'missing Auto parent');
}
