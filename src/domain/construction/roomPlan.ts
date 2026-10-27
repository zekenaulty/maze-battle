import { validateSeed } from '../expedition/schematic';
import { unionIntervals } from './intervals';
import type { ConstructionAnchor, ConstructionBounds, ConstructionFragment, ConstructionMember, ConstructionPlan, RoomConstructionBrief, Vector3 } from './types';

/** Provisional game construction policy, not a real-world engineering load standard.
 * Dimensions deliberately match the current consumer; UV, structure and materials stay separate. */
export const ROOM_CONSTRUCTION = Object.freeze({ cell: 3.2, wall: .16, slab: .18, height: 4.8,
  joistHeight: .448, joistWidth: .384, rafterHeight: .224, rafterWidth: .192, post: .32,
  doorWidth: 1.8, doorHeight: 3.3, routeWidth: 1.8, maxBay: 6.4 });
export const LIBRARY_CASE = Object.freeze({ assetId: 'shelving-bookcase-spruce-9d81cdf6d35b', width: 2.4, height: 2.7, depth: .448 });
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const v = (x: number, y: number, z: number): Vector3 => [x, y, z].map(round) as Vector3;
export const overlapsConstruction = (a: ConstructionBounds, b: ConstructionBounds) => a.min.every((n, i) => n < b.max[i] - 1e-6 && a.max[i] > b.min[i] + 1e-6);

/** Complete authoring data. Never call this to disclose unseen canonical geometry. */
export function planRoomConstruction(input: RoomConstructionBrief): ConstructionPlan {
  const brief = structuredClone(input), p = ROOM_CONSTRUCTION; validateSeed(brief.seed);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(brief.id) || ![3, 5].includes(brief.rows) || ![3, 5].includes(brief.columns)
    || !['empty', 'library'].includes(brief.purpose)) throw Error('Unsupported room construction brief');
  const w = brief.columns * p.cell, d = brief.rows * p.cell, h = p.height;
  const members: ConstructionMember[] = [], anchors: ConstructionAnchor[] = [], furnishings: ConstructionPlan['furnishings'] = [];
  const name = (id: string) => `${brief.id}/${id}`;
  const member = (id: string, role: ConstructionMember['role'], min: Vector3, max: Vector3,
    material: ConstructionMember['material'], axis: ConstructionMember['axis'], bearings?: [string, string]) => {
    members.push({ id: name(id), role, min, max, material, axis, uvOrigin: [0, 0, 0], ...(bearings ? { bearings } : {}) });
  };
  const anchor = (id: string, kind: ConstructionAnchor['kind'], position: Vector3, normal: Vector3,
    clearance?: ConstructionBounds, supportedBy?: string) => {
    const key = name(id), old = anchors.find(a => a.id === key);
    const value = { id: key, kind, position, normal, ...(clearance ? { clearance } : {}), ...(supportedBy ? { supportedBy } : {}) };
    if (old) { if (JSON.stringify(old) !== JSON.stringify(value)) throw Error('Conflicting construction anchor'); return key; }
    anchors.push(value); return key;
  };
  const routes: ConstructionBounds[] = [
    { min: v(-p.routeWidth / 2, 0, -d / 2 - p.wall), max: v(p.routeWidth / 2, 2.7, d / 2 + p.wall) },
    { min: v(-w / 2 + p.cell / 2, 0, -p.routeWidth / 2), max: v(w / 2 - p.cell / 2, 2.7, p.routeWidth / 2) },
  ];
  for (let i = 0; i < brief.columns; i++) {
    const x = -w / 2 + p.cell * (i + .5);
    routes.push({ min: v(x - p.routeWidth / 2, 0, -d / 2 + p.cell / 2), max: v(x + p.routeWidth / 2, 2.7, d / 2 - p.cell / 2) });
  }
  for (let i = 0; i < brief.rows; i++) {
    const z = -d / 2 + p.cell * (i + .5);
    routes.push({ min: v(-w / 2 + p.cell / 2, 0, z - p.routeWidth / 2), max: v(w / 2 - p.cell / 2, 2.7, z + p.routeWidth / 2) });
  }
  // The library reserves storage and access zones before framing/mesh creation.
  if (brief.purpose === 'library') {
    for (const side of [-1, 1]) {
      const count = Math.floor((d - 1.6) / (LIBRARY_CASE.width + .4));
      for (let i = 0; i < count; i++) {
        const z = (i - (count - 1) / 2) * (LIBRARY_CASE.width + .4);
        const x = side * (w / 2 - p.wall / 2 - LIBRARY_CASE.depth / 2);
        const bounds = { min: v(x - LIBRARY_CASE.depth / 2, 0, z - LIBRARY_CASE.width / 2), max: v(x + LIBRARY_CASE.depth / 2, LIBRARY_CASE.height, z + LIBRARY_CASE.width / 2) };
        const access = { min: v(side < 0 ? bounds.max[0] : bounds.min[0] - 1, 0, bounds.min[2]),
          max: v(side < 0 ? bounds.max[0] + 1 : bounds.min[0], 2.7, bounds.max[2]) };
        const anchorId = anchor(`storage/${side}/${i}`, 'storage', v(x, 0, z), v(-side, 0, 0), access);
        furnishings.push({ id: name(`case/${side}/${i}`), assetId: LIBRARY_CASE.assetId, position: v(x, 0, z), yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, bounds, anchorId });
      }
    }
  }
  member('floor', 'floor', v(-w / 2 - p.wall / 2, -p.slab, -d / 2 - p.wall / 2), v(w / 2 + p.wall / 2, 0, d / 2 + p.wall / 2), 'floor', 0);
  member('ceiling', 'ceiling', v(-w / 2 - p.wall / 2, h, -d / 2 - p.wall / 2), v(w / 2 + p.wall / 2, h + p.slab, d / 2 + p.wall / 2), 'stone', 0);
  for (const side of [-1, 1]) {
    const z = side * d / 2, lo = z - p.wall / 2, hi = z + p.wall / 2;
    member(`wall/${side}/left`, 'wall', v(-w / 2 - p.wall / 2, 0, lo), v(-p.doorWidth / 2, h, hi), 'stone', 0);
    member(`wall/${side}/right`, 'wall', v(p.doorWidth / 2, 0, lo), v(w / 2 + p.wall / 2, h, hi), 'stone', 0);
    member(`wall/${side}/lintel`, 'wall', v(-p.doorWidth / 2, p.doorHeight, lo), v(p.doorWidth / 2, h, hi), 'stone', 0);
    anchor(`door/${side}`, 'door', v(0, 0, z), v(0, 0, -side), {
      min: v(-p.doorWidth / 2, 0, z - .5), max: v(p.doorWidth / 2, p.doorHeight, z + .5),
    });
    const x = side * w / 2;
    member(`wall/${side}/side`, 'wall', v(x - p.wall / 2, 0, -d / 2 + p.wall / 2), v(x + p.wall / 2, h, d / 2 - p.wall / 2), 'stone', 2);
  }
  const frame = (cells: number) => {
    const half = cells * p.cell / 2, values = [-half + p.wall / 2];
    for (let i = 1; i < cells; i += 2) values.push(-half + i * p.cell);
    values.push(half - p.wall / 2); return values;
  };
  const xs = frame(brief.columns), zs = frame(brief.rows), bottom = h - p.rafterHeight - p.joistHeight;
  const bearing = new Map<string, string>();
  for (let zi = 0; zi < zs.length; zi++) for (let xi = 0; xi < xs.length; xi++) {
    const x = xs[xi], z = zs[zi], boundary = xi === 0 || zi === 0 || xi === xs.length - 1 || zi === zs.length - 1;
    const key = `${xi}/${zi}`;
    if (!boundary) {
      const foot = anchor(`post/${key}/foot`, 'foundation', v(x, 0, z), [0, 1, 0], undefined, name('floor'));
      const top = anchor(`post/${key}/top`, 'post-top', v(x, bottom, z), [0, 1, 0], undefined, name(`post/${key}`));
      member(`post/${key}`, 'post', v(x - p.post / 2, 0, z - p.post / 2), v(x + p.post / 2, bottom, z + p.post / 2), 'timber', 1, [foot, top]);
      bearing.set(key, top);
    } else {
      const wall = members.find(m => m.role === 'wall' && m.min.every((a, i) => a <= [x, bottom, z][i] + 1e-6 && m.max[i] >= [x, bottom, z][i] - 1e-6));
      if (!wall) throw Error('Missing wall bearing');
      bearing.set(key, anchor(`wall-bearing/${key}`, 'wall-pocket', v(x, bottom, z), [0, 1, 0], undefined, wall.id));
    }
  }
  for (let zi = 0; zi < zs.length; zi++) for (let xi = 0; xi < xs.length - 1; xi++) {
    member(`joist/${zi}/${xi}`, 'joist', v(xs[xi], bottom, Math.max(-d / 2 - p.wall / 2, zs[zi] - p.joistWidth / 2)), v(xs[xi + 1], bottom + p.joistHeight, Math.min(d / 2 + p.wall / 2, zs[zi] + p.joistWidth / 2)),
      'timber', 0, [bearing.get(`${xi}/${zi}`)!, bearing.get(`${xi + 1}/${zi}`)!]);
  }
  const pitch = p.cell / 3;
  for (let i = 1; i < brief.columns * 3; i++) {
    const x = -w / 2 + i * pitch, beam = Math.min(xs.length - 2, xs.findIndex((a, n) => n < xs.length - 1 && x >= a && x <= xs[n + 1]));
    if (beam < 0) continue;
    for (let zi = 0; zi < zs.length - 1; zi++) {
      const ends = [zi, zi + 1].map(z => anchor(`rafter-bearing/${i}/${z}`, 'beam-top', v(x, h - p.rafterHeight, zs[z]), [0, 1, 0], undefined, name(`joist/${z}/${beam}`))) as [string, string];
      member(`rafter/${i}/${zi}`, 'rafter', v(x - p.rafterWidth / 2, h - p.rafterHeight, zs[zi]), v(x + p.rafterWidth / 2, h, zs[zi + 1]), 'timber', 2, ends);
    }
  }
  const plan: ConstructionPlan = { version: 'construction-plan-v1', profile: 'framed-room-v1', id: brief.id, brief,
    frame: { units: 'world', axes: 'right-handed-y-up', forward: '-z' }, bounds: {
      min: v(-w / 2 - p.wall / 2, -p.slab, -d / 2 - p.wall / 2), max: v(w / 2 + p.wall / 2, h + p.slab, d / 2 + p.wall / 2),
    }, members, anchors, furnishings, routes };
  validateConstructionPlan(plan); return plan;
}

export function validateConstructionPlan(plan: ConstructionPlan) {
  if (plan.version !== 'construction-plan-v1' || !['framed-room-v1', 'stairwell-assembly-v1'].includes(plan.profile)
    || plan.members.length > 512 || plan.anchors.length > 512 || plan.furnishings.length > 32 || plan.routes.length > 32) throw Error('Construction plan budget exceeded');
  const vector = (v: number[]) => v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 1e6);
  const bounds = (b: ConstructionBounds) => vector(b.min) && vector(b.max) && b.min.every((n, i) => n < b.max[i]);
  if (!bounds(plan.bounds) || plan.routes.some(r => !bounds(r))) throw Error('Invalid construction envelope');
  const ids = [...plan.members, ...plan.anchors, ...plan.furnishings].map(p => p.id);
  if (new Set(ids).size !== ids.length) throw Error('Duplicate construction identity');
  const byId = new Map(plan.anchors.map(a => [a.id, a]));
  const members = new Map(plan.members.map(m => [m.id, m]));
  for (const a of plan.anchors) {
    if (!vector(a.position) || !vector(a.normal) || Math.abs(Math.hypot(...a.normal) - 1) > 1e-6
      || a.clearance && !bounds(a.clearance)) throw Error('Invalid construction anchor');
    if (a.supportedBy) {
      const support = members.get(a.supportedBy); if (!support) throw Error('Missing construction support');
      if (!a.position.every((n, i) => n >= support.min[i] - 1e-6 && n <= support.max[i] + 1e-6)) throw Error('Construction bearing misses its support');
    }
  }
  for (const m of plan.members) {
    if (!bounds(m) || ![0, 1, 2].includes(m.axis) || !vector(m.uvOrigin)) throw Error('Invalid construction member bounds');
    if (!m.min.every((a, i) => a >= plan.bounds.min[i] - 1e-6 && m.max[i] <= plan.bounds.max[i] + 1e-6)) throw Error('Construction escapes its envelope');
    if (m.material === 'timber' && m.max[m.axis] - m.min[m.axis] > ROOM_CONSTRUCTION.maxBay + 1e-6) throw Error('Construction member exceeds selected bay policy');
    if (m.bearings?.some(id => !byId.has(id))) throw Error('Missing construction bearing');
    if (m.role === 'post' && (plan.routes.some(r => overlapsConstruction(m, r))
      || plan.furnishings.some(f => overlapsConstruction(m, f.bounds) || overlapsConstruction(m, byId.get(f.anchorId)!.clearance!)))) throw Error('Construction blocks reserved access');
  }
  for (const f of plan.furnishings) if (!byId.has(f.anchorId) || plan.routes.some(r => overlapsConstruction(f.bounds, r))) throw Error('Furnishing blocks reserved route');
}

/** Visibility/batch fragments retain their original identity; only true member ends get caps.
 * Regions must cover the whole cross section. This does not authorize game disclosure. */
export function clipConstructionMembers(plan: ConstructionPlan, regions: ConstructionBounds[]): ConstructionFragment[] {
  if (regions.length > 256) throw Error('Construction clip budget exceeded');
  validateConstructionPlan(plan);
  if (regions.some(r => r.min.length !== 3 || r.max.length !== 3 || !r.min.every((n, i) => Number.isFinite(n) && Number.isFinite(r.max[i]) && n < r.max[i]))) throw Error('Invalid construction clip region');
  return plan.members.flatMap(m => {
    const spans = unionIntervals(regions.filter(r => m.min.every((v, i) => i === m.axis || r.min[i] <= v + 1e-6 && r.max[i] >= m.max[i] - 1e-6))
      .map(r => [Math.max(m.min[m.axis], r.min[m.axis]), Math.min(m.max[m.axis], r.max[m.axis])] as [number, number]).filter(([a, b]) => b > a + 1e-6));
    return spans.map(([a, b]) => { const min = [...m.min] as Vector3, max = [...m.max] as Vector3; min[m.axis] = a; max[m.axis] = b;
      return { id: `${m.id}/fragment/${round(a)}/${round(b)}`, memberId: m.id, min, max,
        capStart: Math.abs(a - m.min[m.axis]) < 1e-6, capEnd: Math.abs(b - m.max[m.axis]) < 1e-6 }; });
  });
}
