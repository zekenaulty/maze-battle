import { overlapsConstruction, planRoomConstruction, ROOM_CONSTRUCTION as P, validateConstructionPlan } from './roomPlan';
import type { BuildingConstructionBrief, ConstructionAnchor, ConstructionBounds, ConstructionMember, ConstructionPlan, Vector3 } from './types';

export const BUILDING = Object.freeze({ rise: P.height + P.slab, stairX: -P.cell, run: .42 * 18,
  shaftHalfWidth: 1.1, parapet: .6, bodyWidth: .76 });
export interface ResolvedBuildingFlight {
  revision: string; rise: number; run: number; width: number; landing: number;
  parts: { id: string; min: Vector3; max: Vector3 }[];
}
const v = (x: number, y: number, z: number): Vector3 => [x, y, z].map(n => Math.round(n * 1e6) / 1e6) as Vector3;
const contains = (m: ConstructionBounds, point: Vector3) => point.every((n, i) => n >= m.min[i] - 1e-6 && n <= m.max[i] + 1e-6);

/** Bounded complete authoring profile. Room plans remain immutable inputs. No world admission. */
export function planBuildingConstruction(brief: BuildingConstructionBrief, flight: ResolvedBuildingFlight): ConstructionPlan {
  if (brief.storeys !== 2 || !['empty', 'library'].includes(brief.purpose) || !/^[a-z0-9][a-z0-9-]{0,55}$/.test(brief.id)) throw Error('Unsupported building brief');
  if (Math.abs(flight.rise - BUILDING.rise) > 1e-6 || Math.abs(flight.run - BUILDING.run) > 1e-6 || flight.width !== 1.8 || flight.landing !== 1.8
    || flight.parts.length !== 36 || !flight.revision.startsWith('straight-stair-v1/')) throw Error('Unsupported building flight');
  const w = 3 * P.cell, d = 5 * P.cell, halfRun = flight.run / 2, x = BUILDING.stairX;
  const shaft = { min: v(x - BUILDING.shaftHalfWidth, 0, -halfRun), max: v(x + BUILDING.shaftHalfWidth, flight.rise + 2.7, halfRun) };
  const id = (s: string) => brief.id + '/' + s;
  const members: ConstructionMember[] = [], anchors: ConstructionAnchor[] = [], furnishings: ConstructionPlan['furnishings'] = [], routes: ConstructionBounds[] = [];
  const add = (key: string, role: ConstructionMember['role'], min: Vector3, max: Vector3, material: ConstructionMember['material'] = 'stone', axis: 0 | 1 | 2 = 0,
    bearings?: [string, string], storey: 0 | 1 = 0) => {
    const m: ConstructionMember = { id: id(key), role, min, max, material, axis, uvOrigin: [0, 0, 0], storey, ...(bearings ? { bearings } : {}) };
    members.push(m); return m;
  };
  const anchor = (key: string, kind: ConstructionAnchor['kind'], position: Vector3, supportedBy: string) => {
    const name = id(key); anchors.push({ id: name, kind, position, normal: [0, 1, 0], supportedBy }); return name;
  };
  // Program and circulation reserve the entire west stair/access zone before storage placement.
  for (const storey of [0, 1] as const) {
    const y = storey * BUILDING.rise;
    const room = planRoomConstruction({ id: brief.id + '-level-' + storey, seed: brief.seed, rows: 5, columns: 3, purpose: brief.purpose,
      storageExclusions: [{ min: v(shaft.min[0] - .5, 0, -halfRun - flight.landing), max: v(shaft.max[0], 3, halfRun + flight.landing) }] });
    const move = (point: Vector3): Vector3 => v(point[0], point[1] + y, point[2]);
    for (const source of room.members) {
      if (storey === 0 && source.role === 'ceiling') continue;
      const m = { ...source, min: move(source.min), max: move(source.max), uvOrigin: [0, 0, 0] as Vector3, storey };
      // Building walls own the exterior skin. Pocketed joists stop within it,
      // avoiding coincident timber/masonry faces on the complete facade.
      if (m.role === 'joist') { m.min[2] = Math.max(m.min[2], -d / 2); m.max[2] = Math.min(m.max[2], d / 2); }
      if (storey === 1 && source.role === 'floor') {
        const lo = m.min, hi = m.max;
        for (const [key, min, max] of [
          ['west', lo, v(shaft.min[0], hi[1], hi[2])], ['east', v(shaft.max[0], lo[1], lo[2]), hi],
          ['south', v(shaft.min[0], lo[1], lo[2]), v(shaft.max[0], hi[1], shaft.min[2])],
          ['north', v(shaft.min[0], lo[1], shaft.max[2]), v(shaft.max[0], hi[1], hi[2])],
        ] as const) members.push({ ...m, id: m.id + '/' + key, min: [...min], max: [...max], sourceMemberId: m.id });
      } else if (storey === 0 && (m.role === 'joist' || m.role === 'rafter') && overlapsConstruction(m, shaft)) {
        const axis = m.axis, a = shaft.min[axis], b = shaft.max[axis];
        for (const [key, start, end] of [['before', m.min[axis], Math.min(m.max[axis], a)], ['after', Math.max(m.min[axis], b), m.max[axis]]] as const) {
          if (end - start < 1e-6) continue;
          const min = [...m.min] as Vector3, max = [...m.max] as Vector3; min[axis] = start; max[axis] = end;
          const bearings = [...m.bearings!] as [string, string];
          for (const [endIndex, coordinate] of [[0, start], [1, end]] as const) if (Math.abs(coordinate - (endIndex ? m.max[axis] : m.min[axis])) > 1e-6) {
            const position = v((min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2); position[axis] = coordinate;
            const support = axis === 0 ? id(`shaft/side/${endIndex ? 'west' : 'east'}/${position[2] < 0 ? 0 : 1}`) : id(`shaft/end/${endIndex ? -1 : 1}`);
            bearings[endIndex] = anchor(`cut-bearing/${source.id}/${key}/${endIndex}`, 'beam-top', position, support);
          }
          members.push({ ...m, id: m.id + '/' + key, min, max, bearings, sourceMemberId: m.id });
        }
      } else members.push(m);
    }
    anchors.push(...room.anchors.map(a => ({ ...a, position: move(a.position), ...(a.clearance ? { clearance: { min: move(a.clearance.min), max: move(a.clearance.max) } } : {}),
      ...(storey === 1 && a.kind === 'door' ? { kind: 'window' as const, position: move(v(a.position[0], 1, a.position[2])),
        clearance: { min: move(v(-.9, 1, a.position[2] - .08)), max: move(v(.9, 2.8, a.position[2] + .08)) } } : {}) })));
    furnishings.push(...room.furnishings.map(f => ({ ...f, storey, position: move(f.position), bounds: { min: move(f.bounds.min), max: move(f.bounds.max) } })));
    for (const r of room.routes) {
      const min = move(r.min), max = move(r.max); min[0] = Math.max(-1.5, min[0]);
      if (storey) { min[2] = Math.max(-6.8, min[2]); max[2] = Math.min(6.8, max[2]); }
      if (min.every((n, i) => n < max[i])) routes.push({ min, max });
    }
  }
  const sideBottom = P.height - P.rafterHeight - P.joistHeight, sideTop = sideBottom + P.joistHeight;
  for (const [side, cx] of [['west', shaft.min[0] - .2], ['east', shaft.max[0] + .2]] as const) {
    const tops: string[] = [];
    for (const [i, z] of [-halfRun - .2, 0, halfRun + .2].entries()) {
      const key = `shaft/post/${side}/${i}`;
      const foot = anchor(key + '/foot', 'foundation', v(cx, 0, z), brief.id + '-level-0/floor');
      const top = anchor(key + '/top', 'post-top', v(cx, sideBottom, z), id(key)); tops.push(top);
      add(key, 'post', v(cx - .16, 0, z - .16), v(cx + .16, sideBottom, z + .16), 'timber', 1, [foot, top]);
    }
    for (let i = 0; i < 2; i++) add(`shaft/side/${side}/${i}`, 'joist', v(cx - .2, sideBottom, i ? 0 : -halfRun - .2),
      v(cx + .2, sideTop, i ? halfRun + .2 : 0), 'timber', 2, [tops[i], tops[i + 1]]);
  }
  for (const side of [-1, 1]) {
    const z = side * (halfRun + .2), ends = [shaft.min[0] - .2, shaft.max[0] + .2].map((cx, i) =>
      anchor(`shaft/end/${side}/bearing/${i}`, 'beam-top', v(cx, sideTop, z), id(`shaft/side/${i ? 'east' : 'west'}/${side < 0 ? 0 : 1}`))) as [string, string];
    add(`shaft/end/${side}`, 'rafter', v(shaft.min[0] - .2, sideTop, z - .2), v(shaft.max[0] + .2, P.height, z + .2), 'timber', 0, ends);
    const lo = side * (halfRun + flight.landing / 2), y = side < 0 ? 0 : flight.rise;
    anchors.push({ id: id(`landing/${side}`), kind: 'door', position: v(x, y, lo), normal: v(0, 0, -side),
      clearance: { min: v(x - .9, y, lo - .38), max: v(x + .9, y + 2.7, lo + .38) } });
    // Turn within the full landing deck, beyond the existing room post at z=-4.8.
    const turn = side * (halfRun + 1.6), radius = BUILDING.bodyWidth / 2;
    routes.push({ min: v(x - radius, y, Math.min(lo, turn) - radius), max: v(x + radius, y + 2.7, Math.max(lo, turn) + radius) },
      { min: v(x - radius, y, turn - radius), max: v(.9, y + 2.7, turn + radius) });
  }
  for (const part of flight.parts) {
    if (!part.id.match(/^(tread|riser)-\d+$/) || !part.min.every((n, i) => Number.isFinite(n) && n < part.max[i])) throw Error('Invalid resolved flight');
    add('flight/' + part.id, 'floor', v(part.min[0] + x, part.min[1], part.min[2] - halfRun),
      v(part.max[0] + x, part.max[1], part.max[2] - halfRun), part.id.startsWith('tread') ? 'floor' : 'stone');
  }
  // Shared slab closes the wall-height band; upstairs external openings are windows.
  for (const side of [-1, 1]) {
    const z = side * d / 2, wx = side * w / 2;
    add(`band/end/${side}`, 'wall', v(-w / 2 - .08, P.height, z - .08), v(w / 2 + .08, BUILDING.rise, z + .08));
    add(`band/side/${side}`, 'wall', v(wx - .08, P.height, -d / 2 + .08), v(wx + .08, BUILDING.rise, d / 2 - .08), 'stone', 2);
    add(`window/${side}/sill`, 'wall', v(-.9, BUILDING.rise, z - .08), v(.9, BUILDING.rise + 1, z + .08), 'stone', 0, undefined, 1);
    add(`window/${side}/top`, 'wall', v(-.9, BUILDING.rise + 2.8, z - .08), v(.9, BUILDING.rise + P.doorHeight, z + .08), 'stone', 0, undefined, 1);
    const roof = BUILDING.rise + P.height + P.slab;
    add(`parapet/end/${side}`, 'wall', v(-w / 2 - .08, roof, z - .08), v(w / 2 + .08, roof + BUILDING.parapet, z + .08), 'stone', 0, undefined, 1);
    add(`parapet/side/${side}`, 'wall', v(wx - .08, roof, -d / 2 + .08), v(wx + .08, roof + BUILDING.parapet, d / 2 - .08), 'stone', 2, undefined, 1);
  }
  const used = new Set([...members.flatMap(m => m.bearings ?? []), ...furnishings.map(f => f.anchorId)]);
  const kept = anchors.filter(a => used.has(a.id) || a.kind === 'door' || a.kind === 'window');
  for (const a of kept) if (a.supportedBy && !members.some(m => m.id === a.supportedBy)) {
    const fragments = members.filter(m => m.sourceMemberId === a.supportedBy && contains(m, a.position));
    if (!fragments.length) throw Error('Building cut removed a required bearing'); a.supportedBy = fragments[0].id;
  }
  const plan: ConstructionPlan = { version: 'construction-plan-v1', profile: 'two-storey-building-v1', id: brief.id,
    frame: { units: 'world', axes: 'right-handed-y-up', forward: '-z' }, brief: structuredClone(brief),
    bounds: { min: v(-w / 2 - .08, -P.slab, -d / 2 - .08), max: v(w / 2 + .08, BUILDING.rise + P.height + P.slab + BUILDING.parapet, d / 2 + .08) },
    members, anchors: kept, furnishings, routes, dependencies: [{ recipe: 'framed-room-v1', revision: 'framed-room-v1' },
      { recipe: 'straight-stair-v1', revision: flight.revision }] };
  validateConstructionPlan(plan);
  if (members.some(m => !m.id.includes('/flight/') && overlapsConstruction(m, shaft))) throw Error('Building structure blocks stair headroom');
  if (routes.some(r => members.some(m => overlapsConstruction(m, r)))) throw Error('Building route lacks body clearance');
  for (const a of kept.filter(a => a.kind === 'window')) if (members.some(m => overlapsConstruction(m, a.clearance!))) throw Error('Window opening is obstructed');
  return plan;
}

export interface BuildingPlacement { id: string; realmId: string; translation: Vector3; plan: ConstructionPlan }
export interface BuildingComposition { version: 'building-composition-v1'; id: string; realmId: string; buildings: BuildingPlacement[]; street: ConstructionBounds; alley: ConstructionBounds; bounds: ConstructionBounds }
export const translatedBounds = (b: ConstructionBounds, t: Vector3): ConstructionBounds => ({ min: b.min.map((n, i) => n + t[i]) as Vector3, max: b.max.map((n, i) => n + t[i]) as Vector3 });
export function composeBuildingPair(left: ConstructionPlan, right: ConstructionPlan): BuildingComposition {
  const realmId = 'authoring-surface-v1', spacing = 5.68;
  const buildings = [left, right].map((plan, i) => ({ id: `building-${i}`, realmId, translation: v(i ? spacing : -spacing, 0, 0), plan }));
  const street = { min: v(-11.6, -.18, 8.08), max: v(11.6, 0, 12.88) };
  const alley = { min: v(-.8, -.18, -8.08), max: v(.8, 0, 8.08) };
  const bounds = { min: v(-11.6, -.18, -8.08), max: v(11.6, Math.max(left.bounds.max[1], right.bounds.max[1]), 12.88) };
  const result: BuildingComposition = { version: 'building-composition-v1', id: 'street-pair-proof', realmId, buildings, street, alley, bounds };
  validateBuildingComposition(result); return result;
}
export function validateBuildingComposition(composition: BuildingComposition) {
  if (composition.version !== 'building-composition-v1' || composition.buildings.length !== 2 || new Set(composition.buildings.map(b => b.id)).size !== 2) throw Error('Invalid building composition');
  const boxes = composition.buildings.map(b => { validateConstructionPlan(b.plan);
    if (b.realmId !== composition.realmId || !b.translation.every(Number.isFinite)) throw Error('Street link requires the same realm');
    return translatedBounds(b.plan.bounds, b.translation); });
  if (overlapsConstruction(boxes[0], boxes[1])) throw Error('Neighboring buildings overlap within their realm');
  for (const surface of [composition.street, composition.alley]) {
    if (!surface.min.every((n, i) => Number.isFinite(n) && Number.isFinite(surface.max[i]) && n < surface.max[i])
      || surface.max[1] !== 0 || boxes.some(b => overlapsConstruction(b, surface))) throw Error('Invalid shared ground surface');
  }
  for (const [i, b] of composition.buildings.entries()) {
    const box = boxes[i], door = b.plan.anchors.find(a => a.kind === 'door' && Math.abs(a.position[2] - 8) < 1e-6 && a.position[1] === 0);
    if (!door || Math.abs(box.max[2] - composition.street.min[2]) > 1e-6 || Math.abs(b.translation[1] - composition.street.max[1]) > 1e-6
      || door.position[0] + b.translation[0] - .9 < composition.street.min[0] || door.position[0] + b.translation[0] + .9 > composition.street.max[0]) throw Error('Street does not meet the building entrance');
  }
  if (Math.abs(composition.alley.min[0] - boxes[0].max[0]) > 1e-6 || Math.abs(composition.alley.max[0] - boxes[1].min[0]) > 1e-6
    || Math.abs(composition.alley.max[2] - composition.street.min[2]) > 1e-6) throw Error('Alley does not join its neighbors and street');
  if ([...boxes, composition.street, composition.alley].some(b => !b.min.every((n, i) => n >= composition.bounds.min[i] - 1e-6 && b.max[i] <= composition.bounds.max[i] + 1e-6))) throw Error('Composition escapes its envelope');
}
