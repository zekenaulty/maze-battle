import { passesModuleStructuralQuality } from '../../../domain/expedition/topology/modules/quality';
import type { CanonicalPages } from '../pages';
import { check, integer } from '../validation';
import { json, same } from './records';
import { readQualityRoom } from './qualityGraph';
import { qualityNamespace, qualityScratchPrefix } from './qualityWitness';
import { qualityContext, qualityKey, qualityNodeKey, qualityProgressKey, readQualityProgress,
  validateQualityNode, type QualityNode, type WorldFloorQuality } from './qualityRecords';
import type { WorldRead } from './types';

export type { WorldFloorQuality, WorldQualityBinding } from './qualityRecords';
export const MAX_QUALITY_ROOMS_PER_ADVANCE = 4;

/** Engine-owned structural proof only, not role/content/knowledge readiness or App cutover.
 * Run within executeCanonical and reconcile the ORIGINAL attempt after an uncertain outcome.
 * The completed generation and its topology records are immutable inputs to this proof. */
export async function beginWorldFloorQuality(pages: CanonicalPages, level: number): Promise<WorldFloorQuality> {
  const context = await qualityContext(pages, level), prior = await pages.get('world', qualityKey(level));
  if (prior) {
    const state = await readQualityProgress(pages, context, prior);
    check(state.status !== 'failed', 'floor failed structural qualification'); return state;
  }
  check(!await pages.get('world', qualityProgressKey(level)), 'missing established quality anchor');
  check(await qualityNamespace(pages, qualityScratchPrefix(level)) === null, 'missing established quality controls with surviving nodes');
  const anchor = await pages.set('world', qualityKey(level), json({ schema: 1, level, binding: context.binding }));
  const state: WorldFloorQuality = { schema: 1, level, binding: context.binding, anchorId: anchor.id,
    nextRoom: context.binding.roomCount - 1, lastNodeId: null, scratchWitness: null, status: 'running', metrics: null };
  await pages.set('world', qualityProgressKey(level), json(state)); return state;
}

export async function loadWorldFloorQuality(pages: WorldRead, level: number): Promise<WorldFloorQuality> {
  const context = await qualityContext(pages, level), anchor = await pages.get('world', qualityKey(level));
  check(anchor, 'floor quality has not begun or established anchor is missing');
  return readQualityProgress(pages, context, anchor);
}

export const loadWorldQuality = loadWorldFloorQuality;

/** Does not infer qualification from roles, exit existence or generation completion. */
export async function requireWorldFloorQuality(pages: WorldRead, level: number): Promise<WorldFloorQuality> {
  const state = await loadWorldFloorQuality(pages, level);
  check(state.status === 'qualified', 'floor is not structurally qualified'); return state;
}

/** Reverse generation ordinals are a postorder because every join's parent is older.
 * Strict parent ordering + reciprocal unique edges prove a tree; root totals prove coverage.
 * Each node persists only a bounded local reduction, never a growing queue or floor manifest. */
export async function advanceWorldFloorQuality(pages: CanonicalPages, level: number,
  maxRooms = MAX_QUALITY_ROOMS_PER_ADVANCE): Promise<WorldFloorQuality> {
  check(integer(maxRooms, 1) && maxRooms <= MAX_QUALITY_ROOMS_PER_ADVANCE, 'invalid quality advance limit');
  const context = await qualityContext(pages, level), anchor = await pages.get('world', qualityKey(level));
  check(anchor, 'floor quality has not begun or established anchor is missing');
  let state = await readQualityProgress(pages, context, anchor);
  check(state.status !== 'failed', 'floor failed structural qualification');
  if (state.status === 'qualified') return state;
  for (let step = 0; step < maxRooms && state.nextRoom >= 0; step++) {
    const room = await readQualityRoom(pages, context, state.nextRoom), children: QualityNode[] = [];
    for (const child of room.children) {
      const row = await pages.get('world', qualityNodeKey(level, child.ordinal));
      check(row, 'missing established quality child');
      const node = validateQualityNode(row, state, child.ordinal);
      check(node.parent === room.ordinal && node.degree === child.degree && same(node.witness, child.witness),
        'changed established quality child or reciprocal parent');
      children.push(node);
    }
    const { arm, metrics } = reduceQualityTreeNode(room.ordinal, room.degree, children);
    const node: QualityNode = { schema: 1, anchorId: state.anchorId, ordinal: room.ordinal, parent: room.parent,
      degree: room.degree, witness: room.witness, arm, metrics };
    const key = qualityNodeKey(level, room.ordinal);
    check(!await pages.get('world', key), 'quality cursor would overwrite established node');
    const written = await pages.set('world', key, json(node)); validateQualityNode(written, state, room.ordinal);
    const status = room.ordinal !== 0 ? 'running' : passesModuleStructuralQuality(metrics, state.binding.roomCount) ? 'qualified' : 'failed';
    state = { ...state, nextRoom: room.ordinal - 1, lastNodeId: written.id, status, metrics: room.ordinal === 0 ? metrics : null };
  }
  state = { ...state, scratchWitness: await qualityNamespace(pages, qualityScratchPrefix(level)) };
  await pages.set('world', qualityProgressKey(level), json(state)); return state;
}

/** arm excludes the edge from the parent; degree-2 entry joins its two downward arms. */
export function reduceQualityTreeNode(ordinal: number, degree: number, children: Pick<QualityNode, 'arm' | 'metrics'>[]) {
  check(children.length === degree - Number(ordinal !== 0) && degree >= 1 && degree <= 4, 'invalid quality reduction degree');
  const lengths = children.map(child => child.arm + 1);
  const arm = ordinal !== 0 && degree === 2 ? lengths[0] : 0;
  const localChain = degree !== 2 ? Math.max(0, ...lengths) : ordinal === 0 ? lengths[0] + lengths[1] : 0;
  const metrics = { rooms: 1, reachable: 1, joins: 0, forks: Number(degree >= 3), longestChain: localChain };
  for (const child of children) {
    metrics.rooms += child.metrics.rooms; metrics.reachable += child.metrics.reachable;
    metrics.joins += child.metrics.joins + 1; metrics.forks += child.metrics.forks;
    metrics.longestChain = Math.max(metrics.longestChain, child.metrics.longestChain);
  }
  return { arm, metrics };
}
