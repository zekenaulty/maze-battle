import type { CellAddress } from '../expedition/types';
import { compass } from '../expedition/explorationGraph';
import { assertPerceptionEvidence } from './perceptionEvidence';
import { DIRECTED_LIMITS, type ObservationReceipt, type PerceivedScene } from './types';

export const DIRECTED_SOURCE_LIMITS = Object.freeze({ ids: 8, idLength: 160, bytes: DIRECTED_LIMITS.bytes });
export interface ObservationSourceIdentity { worldId: string; floorId: string; observerId: string }
export interface ObservationSourcesContext { json: string; bytes: number; observationIds: string[] }
export type PublicObservationSource = Omit<ObservationReceipt, 'sourceWorldRevision'>;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Directed sources: ${message}`);
}
function sourceId(value: unknown): asserts value is string {
  check(typeof value === 'string' && value.length > 0 && value.length <= DIRECTED_SOURCE_LIMITS.idLength
    && !/[\u0000-\u001f]/.test(value), 'invalid identifier');
}
export function assertObservationSourceIds(ids: unknown): asserts ids is string[] {
  check(Array.isArray(ids) && ids.length <= DIRECTED_SOURCE_LIMITS.ids, 'source ID limit exceeded');
  for (const id of ids) sourceId(id);
  check(new Set(ids).size === ids.length, 'duplicate requested source ID');
}
function text(value: string): string {
  check(typeof value === 'string', 'invalid source text');
  return value;
}
function integer(value: number, minimum = 0): number {
  check(Number.isSafeInteger(value) && value >= minimum, 'invalid source integer');
  return value;
}
function choice<T extends string>(value: T, allowed: readonly T[]): T {
  check(allowed.includes(value), 'invalid source enum');
  return value;
}
function list<T>(values: T[], maximum: number = DIRECTED_LIMITS.cells): T[] {
  check(Array.isArray(values) && values.length <= maximum, 'source array limit exceeded');
  check(Array.from(values).every(value => value !== undefined && value !== null), 'invalid source array');
  return values;
}
function address(value: CellAddress): CellAddress {
  sourceId(value.spaceId);
  return { spaceId: value.spaceId, row: integer(value.row), column: integer(value.column) };
}

/** Explicit nested allowlists: unknown fields and audit metadata are never copied or serialized. */
function publicScene(scene: PerceivedScene): PerceivedScene {
  const result: PerceivedScene = {
    position: address(scene.position),
    cells: list(scene.cells).map(cell => ({ address: address(cell.address), exits: Object.fromEntries(compass
      .filter(direction => Object.hasOwn(cell.exits, direction) && cell.exits[direction] !== undefined)
      .map(direction => [direction, address(cell.exits[direction]!)])) })),
    spaces: list(scene.spaces).map(space => {
      sourceId(space.id);
      return { id: space.id, name: text(space.name), originX: integer(space.originX, Number.MIN_SAFE_INTEGER),
        originZ: integer(space.originZ, Number.MIN_SAFE_INTEGER), rows: integer(space.rows, 1), columns: integer(space.columns, 1) };
    }),
    features: list(scene.features).map(feature => {
      sourceId(feature.id);
      return { id: feature.id, kind: choice(feature.kind, ['lever', 'door', 'trap', 'chest', 'altar']),
        name: text(feature.name), position: address(feature.position),
        state: choice(feature.state, ['idle', 'active', 'locked', 'closed', 'open']),
        ...(feature.disclosure === undefined ? {} : { disclosure: choice<'detected'>(feature.disclosure, ['detected']) }) };
    }),
    absentFeatureIds: list(scene.absentFeatureIds).map(id => { sourceId(id); return id; }),
  };
  if (scene.cues !== undefined) result.cues = list(scene.cues, 5).map(cue => ({
    kind: choice(cue.kind, ['suspicious']), direction: choice(cue.direction, [...compass, 'here']),
    message: choice(cue.message, ['Something seems unusual nearby.']),
  }));
  if (scene.examinations !== undefined) result.examinations = list(scene.examinations).map(examination => {
    sourceId(examination.featureId);
    return { featureId: examination.featureId, detail: text(examination.detail) };
  });
  if (scene.inspection !== undefined) {
    const value = scene.inspection;
    sourceId(value.attemptId);
    result.inspection = { attemptId: value.attemptId, direction: choice(value.direction, [...compass, 'here']),
      viewpoint: address(value.viewpoint), coveredCells: list(value.coveredCells, 1).map(address),
      depth: choice(value.depth, ['surface', 'detail']), limitation: choice(value.limitation, ['adjacent-cell-only', 'no-visible-crossing']) };
  }
  if (scene.traversal !== undefined) {
    check(typeof scene.traversal.passable === 'boolean', 'invalid traversal passability');
    result.traversal = { from: address(scene.traversal.from), to: address(scene.traversal.to), passable: scene.traversal.passable };
  }
  if (scene.crossingRecovery !== undefined) result.crossingRecovery = {
    policyVersion: choice(scene.crossingRecovery.policyVersion, ['observed-door-change-v1']),
    edges: list(scene.crossingRecovery.edges, 4).map(edge => {
      sourceId(edge.featureId);
      return { from: address(edge.from), to: address(edge.to), featureId: edge.featureId, change: choice(edge.change, ['opened', 'removed']) };
    }),
  };
  return result;
}

export function presentObservationSources(identity: ObservationSourceIdentity, knowledgeRevision: number,
  requestedSourceIds: string[], sources: ObservationReceipt[]): ObservationSourcesContext {
  sourceId(identity.worldId); sourceId(identity.floorId); sourceId(identity.observerId);
  integer(knowledgeRevision);
  assertObservationSourceIds(requestedSourceIds);
  const requested = [...requestedSourceIds];
  const byId = new Map<string, PublicObservationSource>();
  const seenIds = new Set<string>();
  const sequences = new Set<number>();
  for (const source of list(sources, DIRECTED_SOURCE_LIMITS.ids)) {
    sourceId(source.id);
    check(requested.includes(source.id) && !seenIds.has(source.id), 'unrequested or duplicate source');
    check(source.worldId === identity.worldId && source.observerId === identity.observerId, 'source scope mismatch');
    integer(source.sequence, 1);
    check(!sequences.has(source.sequence), 'source sequence mismatch');
    seenIds.add(source.id);
    sequences.add(source.sequence);
    // A later source must not rewrite an archived response that originally reported this ID missing.
    if (source.sequence > knowledgeRevision) continue;
    const value: PublicObservationSource = {
      id: source.id, worldId: source.worldId, observerId: source.observerId, sequence: source.sequence,
      policyVersion: choice(source.policyVersion, ['fixture-visibility-v1', 'fixture-perception-v1']),
      reason: choice(source.reason, ['prelude', 'look', 'travel', 'interaction', 'obstruction', 'inspection']),
      coverage: { radius: integer(source.coverage.radius), basis: choice(source.coverage.basis, ['connected-cells']), complete: true },
      scene: publicScene(source.scene),
    };
    check(source.coverage.complete === true, 'incomplete source coverage');
    if (source.perception !== undefined) value.perception = {
      profileId: choice(source.perception.profileId, ['untrained', 'alert', 'keen', 'expert']),
      effectiveValue: integer(source.perception.effectiveValue), conditions: choice(source.perception.conditions, ['clear']),
    };
    assertPerceptionEvidence(source);
    byId.set(source.id, value);
  }
  const observations = requested.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const json = JSON.stringify({ version: 'directed-sources-v1', worldId: identity.worldId, floorId: identity.floorId,
    observerId: identity.observerId, knowledgeRevision, requestedSourceIds: requested, observations,
    missingIds: requested.filter(id => !byId.has(id)) });
  const bytes = new TextEncoder().encode(json).byteLength;
  check(bytes <= DIRECTED_SOURCE_LIMITS.bytes, 'source context byte limit exceeded');
  return { json, bytes, observationIds: observations.map(source => source.id) };
}
