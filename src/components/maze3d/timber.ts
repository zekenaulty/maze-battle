import { BoxGeometry, BufferGeometry } from 'three';
import type { SceneBox } from './scene';
import { CELL_SIZE, WALL_HEIGHT } from './constants';

type V = [number, number, number];
type Interval = [number, number];
type Bounds = { min: V; max: V };
export interface TimberMember extends Bounds {
  role: 'joist' | 'rafter' | 'trim'; axis: 0 | 1 | 2; origin: V;
}
/** grid-timber-v1: sections/tier joints from TileLab's pinned flat-two-tier profile.
 * 1.6 is this installation's world/authoring conversion, not a logical-cell rule.
 * No fixture context, planned meshes, hidden topology or new collision is consumed. */
export const TIMBER = { conversion: 1.6, tile: 1.6, joistWidth: .384, joistHeight: .448,
  rafterWidth: .192, rafterHeight: .224, trimWidth: .192, minimumSpan: .24 } as const;
const EPS = 1e-6;
const bounds = (b: SceneBox): Bounds => ({ min: b.center.map((n, i) => n - b.size[i] / 2) as V,
  max: b.center.map((n, i) => n + b.size[i] / 2) as V });
function union(input: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of input.sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1); if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}
function subtract(kept: Interval[], cuts: Interval[]) {
  for (const [a, b] of union(cuts)) kept = kept.flatMap(([lo, hi]) => a >= hi - EPS || b <= lo + EPS ? [[lo, hi]]
    : [[lo, Math.min(hi, a)], [Math.max(lo, b), hi]].filter(([x, y]) => y - x > EPS) as Interval[]);
  return kept;
}
/** Whole cross section must lie beneath the union, including on shared cell seams. */
function roofSpans(roofs: Bounds[], axis: 0 | 2, at: number, width: number) {
  const across = axis === 0 ? 2 : 0, lo = at - width / 2, hi = at + width / 2;
  const edges = [...new Set([lo, hi, ...roofs.flatMap(r => [r.min[across], r.max[across]]).filter(v => v > lo && v < hi)])].sort((a, b) => a - b);
  let spans: Interval[] | undefined;
  for (let i = 1; i < edges.length; i++) {
    const sample = (edges[i - 1] + edges[i]) / 2;
    const line = union(roofs.filter(r => sample > r.min[across] - EPS && sample < r.max[across] + EPS).map(r => [r.min[axis], r.max[axis]]));
    spans = spans === undefined ? line : spans.flatMap(([a, b]) => line.map(([c, d]) => [Math.max(a, c), Math.min(b, d)] as Interval).filter(([c, d]) => d - c > EPS));
  }
  return spans ?? [];
}
export function ceilingTimbers(boxes: SceneBox[]): TimberMember[] {
  const groups = new Map<string, SceneBox[]>(), out: TimberMember[] = [];
  for (const box of boxes.filter(b => b.deck === 'ceiling')) {
    const key = JSON.stringify([box.center[1] - box.size[1] / 2, box.textureOrigin]);
    const list = groups.get(key) ?? []; list.push(box); groups.set(key, list);
  }
  const walls = boxes.filter(b => !b.deck && ['stone_bricks', 'unknown'].includes(b.material)).map(bounds);
  for (const group of groups.values()) {
    const roofY = group[0].center[1] - group[0].size[1] / 2, roofs = group.map(bounds);
    const origin: V = [...(group[0].textureOrigin ?? [0, roofY - WALL_HEIGHT, 0])];
    const bottom = roofY - TIMBER.rafterHeight - TIMBER.joistHeight, top = roofY - TIMBER.rafterHeight;
    const local: TimberMember[] = [];
    const add = (role: TimberMember['role'], axis: 0 | 2, at: number, width: number, y0: number, y1: number, span?: Interval) => {
      const across = axis === 0 ? 2 : 0;
      let kept = roofSpans(roofs, axis, at, width);
      if (span) kept = kept.map(([a, b]) => [Math.max(a, span[0]), Math.min(b, span[1])] as Interval).filter(([a, b]) => b > a + EPS);
      const obstacles: Bounds[] = [...walls, ...(role === 'rafter' ? [] : local.filter(m => m.role === 'trim'))];
      kept = subtract(kept, obstacles.filter(b => b.min[1] < y1 - EPS && b.max[1] > y0 + EPS
        && b.min[across] < at + width / 2 - EPS && b.max[across] > at - width / 2 + EPS).map(b => [b.min[axis], b.max[axis]]));
      for (const [a, b] of kept) if (b - a >= TIMBER.minimumSpan - EPS) {
        const min: V = [0, y0, 0], max: V = [0, y1, 0]; min[axis] = a; max[axis] = b;
        min[across] = at - width / 2; max[across] = at + width / 2; local.push({ role, axis, min, max, origin });
      }
    };
    // Corners have deterministic ownership: X trim caps Z trim. Adjacent collinear runs merge.
    for (const axis of [0, 2] as const) {
      const across = axis === 0 ? 2 : 0, runs = new Map<number, Interval[]>();
      for (const wall of walls.filter(b => b.min[1] < top - EPS && b.max[1] > bottom + EPS)) for (const side of [-1, 1]) {
        const at = (side < 0 ? wall.min[across] : wall.max[across]) + side * TIMBER.trimWidth / 2;
        // Continue around convex wall corners to the other strip's outer face.
        // X owns the overlap; subsequent Z cuts turn this into a closed butt joint.
        const spans = runs.get(at) ?? []; spans.push([wall.min[axis] - TIMBER.trimWidth, wall.max[axis] + TIMBER.trimWidth]); runs.set(at, spans);
      }
      for (const [at, spans] of [...runs].sort((a, b) => a[0] - b[0])) for (const span of union(spans)) add('trim', axis, at, TIMBER.trimWidth, bottom, top, span);
    }
    const lattice = (role: 'joist' | 'rafter', axis: 0 | 2, pitch: number, offset: number, width: number, y0: number, y1: number) => {
      const across = axis === 0 ? 2 : 0, lo = Math.min(...roofs.map(r => r.min[across])), hi = Math.max(...roofs.map(r => r.max[across]));
      const datum = origin[across] + offset;
      for (let i = Math.ceil((lo - datum) / pitch); datum + i * pitch <= hi; i++) add(role, axis, datum + i * pitch, width, y0, y1);
    };
    lattice('joist', 0, CELL_SIZE, .64, TIMBER.joistWidth, bottom, top);
    lattice('rafter', 2, CELL_SIZE / 3, .4, TIMBER.rafterWidth, top, roofY);
    out.push(...local);
  }
  return out;
}
/** Each member has two cap faces and four repeat faces; clipping preserves global grain phase. */
export function timberGeometry(member: TimberMember): { sides: BufferGeometry; ends: BufferGeometry } {
  const size = member.max.map((v, i) => v - member.min[i]) as V, center = member.max.map((v, i) => (v + member.min[i]) / 2) as V;
  const box = new BoxGeometry(...size), p = box.getAttribute('position'), n = box.getAttribute('normal'), uv = box.getAttribute('uv');
  const sides: number[] = [], ends: number[] = [], indices = box.index!;
  for (const g of box.groups) {
    const end = Math.abs(n.getComponent(indices.getX(g.start), member.axis)) > .5;
    for (let i = g.start; i < g.start + g.count; i++) (end ? ends : sides).push(indices.getX(i));
  }
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getComponent(i, member.axis)) > .5) continue;
    const span = (p.getComponent(i, member.axis) + center[member.axis] - member.origin[member.axis]) / TIMBER.tile;
    const crossAxis = member.axis === 1 ? (Math.abs(n.getX(i)) > .5 ? 2 : 0) : Math.abs(n.getY(i)) > .5 ? (member.axis === 0 ? 2 : 0) : 1;
    const cross = (p.getComponent(i, crossAxis) + size[crossAxis] / 2) / TIMBER.tile;
    uv.setXY(i, member.role === 'joist' ? cross : span, member.role === 'joist' ? span : cross);
  }
  box.translate(...center); box.clearGroups(); box.setIndex(sides);
  const caps = box.clone(); caps.setIndex(ends); return { sides: box, ends: caps };
}
