import { passesModuleStructuralQuality, type ModuleStructuralQuality } from '../../../domain/expedition/topology/modules/quality';
import type { CanonicalRecord } from '../types';
import { check, integer, isObject, jsonBytes, validId } from '../validation';
import { levelKey, loadFloor, loadWorld, same } from './records';
import { qualityNamespace, qualityScratchPrefix, qualityTopology } from './qualityWitness';
import type { WorldRead } from './types';

export const qualityKey = (level: number) => `${levelKey(level)}/quality`;
export const qualityProgressKey = (level: number) => `${qualityKey(level)}/progress`;
export const qualityNodeKey = (level: number, ordinal: number) => `${qualityKey(level)}/node/${ordinal}`;
export const qualityRoomId = (ordinal: number) => ordinal === 0 ? 'entry' : `socket-${ordinal - 1}:room`;

export interface WorldQualityBinding {
  floorRecordId: string; scopeId: string; revision: number; roomCount: number; entryId: string; exitId: string;
  topology: Awaited<ReturnType<typeof qualityTopology>>;
}
export interface WorldFloorQuality {
  schema: 1; level: number; binding: WorldQualityBinding; anchorId: string;
  nextRoom: number; lastNodeId: string | null; scratchWitness: string | null;
  status: 'running' | 'qualified' | 'failed'; metrics: ModuleStructuralQuality | null;
}
export interface QualityWitness { space: string; ports: string; join: string | null }
export interface QualityNode {
  schema: 1; anchorId: string; ordinal: number; parent: number | null; degree: number;
  witness: QualityWitness; arm: number; metrics: ModuleStructuralQuality;
}

export function qualityFields(value: unknown, fields: string) {
  check(isObject(value) && Object.keys(value).sort().join(',') === fields, 'invalid quality fields');
}

export function qualityOrdinal(id: string, count: number): number {
  if (id === 'entry') return 0;
  const match = typeof id === 'string' && /^socket-(0|[1-9]\d*):room$/.exec(id);
  const ordinal = match ? Number(match[1]) + 1 : NaN;
  check(integer(ordinal, 1) && ordinal < count && qualityRoomId(ordinal) === id, 'invalid quality room identity');
  return ordinal;
}

export async function qualityContext(pages: WorldRead, level: number) {
  const floor = await loadFloor(pages, level), world = await loadWorld(pages), g = floor.generation;
  check(g.recipe.worldId === world.worldId && level <= world.deepestLevel, 'foreign quality floor');
  check(floor.exit && g.rooms === g.recipe.roomBudget && g.pendingCount === 0
    && g.nextSequence === g.revision, 'quality requires completed generation');
  check(g.scopeId.length <= 1024 && qualityOrdinal(floor.exit.spaceId, g.rooms) > 0, 'invalid quality floor binding');
  const row = await pages.get('world', levelKey(level));
  check(row && validId(row.id), 'missing quality floor record');
  const binding: WorldQualityBinding = { floorRecordId: row.id, scopeId: g.scopeId, revision: g.revision,
    roomCount: g.rooms, entryId: floor.entry.spaceId, exitId: floor.exit.spaceId, topology: await qualityTopology(pages, level) };
  return { floor, binding };
}
export type QualityContext = Awaited<ReturnType<typeof qualityContext>>;

export function validateQualityAnchor(row: CanonicalRecord, context: QualityContext) {
  jsonBytes(row.value, 4096); qualityFields(row.value, 'binding,level,schema');
  const value = row.value as unknown as { schema: number; level: number; binding: WorldQualityBinding };
  check(validId(row.id) && value.schema === 1 && value.level === context.floor.level
    && same(value.binding, context.binding), 'stale or invalid quality binding');
}

export function validateQualityNode(row: CanonicalRecord, state: WorldFloorQuality, ordinal: number): QualityNode {
  jsonBytes(row.value, 2048); qualityFields(row.value, 'anchorId,arm,degree,metrics,ordinal,parent,schema,witness');
  const node = row.value as unknown as QualityNode;
  check(node.schema === 1 && node.anchorId === state.anchorId && node.ordinal === ordinal
    && integer(ordinal) && ordinal < state.binding.roomCount, 'invalid quality node binding');
  check(ordinal === 0 ? node.parent === null : integer(node.parent) && node.parent < ordinal, 'invalid quality tree parent');
  check(integer(node.degree, 1) && node.degree <= 4, 'invalid quality degree');
  qualityFields(node.witness, 'join,ports,space');
  check(validId(node.witness.space) && validId(node.witness.ports)
    && (ordinal === 0 ? node.witness.join === null : validId(node.witness.join)), 'invalid quality source witness');
  validateMetrics(node.metrics, state.binding.roomCount - ordinal);
  const children = node.degree - Number(ordinal !== 0);
  check(node.metrics.rooms >= children + 1 && node.metrics.forks >= Number(node.degree >= 3)
    && (children !== 0 || same(node.metrics, { rooms: 1, reachable: 1, joins: 0, forks: 0, longestChain: 0 })),
  'invalid quality subtree reduction');
  check(integer(node.arm) && node.arm < node.metrics.rooms
    && (ordinal !== 0 && node.degree === 2 ? node.arm >= 1 : node.arm === 0), 'invalid quality chain arm');
  return node;
}

function validateMetrics(metrics: ModuleStructuralQuality, maximum: number) {
  qualityFields(metrics, 'forks,joins,longestChain,reachable,rooms');
  check(integer(metrics.rooms, 1) && metrics.rooms <= maximum && metrics.reachable === metrics.rooms
    && metrics.joins === metrics.rooms - 1 && integer(metrics.forks) && metrics.forks <= metrics.rooms
    && integer(metrics.longestChain) && metrics.longestChain <= metrics.joins, 'invalid quality metrics');
}

export async function readQualityProgress(pages: WorldRead, context: QualityContext, anchor: CanonicalRecord) {
  validateQualityAnchor(anchor, context);
  const row = await pages.get('world', qualityProgressKey(context.floor.level));
  check(row, 'missing established quality progress');
  jsonBytes(row.value, 4096);
  qualityFields(row.value, 'anchorId,binding,lastNodeId,level,metrics,nextRoom,schema,scratchWitness,status');
  const state = row.value as unknown as WorldFloorQuality;
  check(state.schema === 1 && state.level === context.floor.level && state.anchorId === anchor.id
    && same(state.binding, context.binding), 'stale or invalid quality progress binding');
  check(integer(state.nextRoom, -1) && state.nextRoom < state.binding.roomCount, 'invalid quality cursor');
  check((state.nextRoom === state.binding.roomCount - 1 ? state.scratchWitness === null : validId(state.scratchWitness))
    && state.scratchWitness === await qualityNamespace(pages, qualityScratchPrefix(state.level)),
  'missing or changed established quality node namespace');
  if (state.nextRoom === state.binding.roomCount - 1) check(state.lastNodeId === null, 'invalid initial quality cursor');
  else {
    const last = await pages.get('world', qualityNodeKey(state.level, state.nextRoom + 1));
    check(last && last.id === state.lastNodeId, 'missing or changed established quality node');
    const node = validateQualityNode(last, state, state.nextRoom + 1);
    if (state.nextRoom === -1) {
      check(same(state.metrics, node.metrics), 'quality result disagrees with root');
      const passed = passesModuleStructuralQuality(node.metrics, state.binding.roomCount);
      check(state.status === (passed ? 'qualified' : 'failed'), 'invalid quality verdict');
    }
  }
  if (state.nextRoom >= 0) check(state.status === 'running' && state.metrics === null, 'premature quality verdict');
  return state;
}
