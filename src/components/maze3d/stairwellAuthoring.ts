import { straightStair } from '../../assets3d/stairs/assembly';
import { validateConstructionPlan } from '../../domain/construction/roomPlan';
import type { ConstructionAnchor, ConstructionMember, ConstructionPlan, Vector3 } from '../../domain/construction/types';
import { ROOM_CONSTRUCTION as P } from '../../domain/construction/roomPlan';

/** Complete two-storey authoring assembly around the preserved native stair recipe.
 * World units, right-handed Y-up, ascent +Z. It is not a bake of a player camera.
 * The runtime presentation's floor-rise conversion remains separately owned. */
export function planAuthoringStairwell(options: { id?: string; rise?: number; tread?: number; steps?: number } = {}): ConstructionPlan {
  const id = options.id ?? 'stairwell-proof';
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw Error('Invalid stairwell identity');
  const stair = straightStair(options), width = 3 * P.cell, depth = 9 * P.cell;
  const lo = stair.run / 2 - depth / 2, hi = stair.run / 2 + depth / 2, roof = stair.rise + P.height;
  const members: ConstructionMember[] = [], anchors: ConstructionAnchor[] = [];
  const v = (x: number, y: number, z: number): Vector3 => [x, y, z];
  const add = (key: string, role: ConstructionMember['role'], min: Vector3, max: Vector3,
    material: ConstructionMember['material'] = 'stone', axis: ConstructionMember['axis'] = 0, bearings?: [string, string]) =>
    members.push({ id: id + '/' + key, role, min, max, material, axis, uvOrigin: [0, 0, 0], ...(bearings ? { bearings } : {}) });
  const anchor = (key: string, kind: ConstructionAnchor['kind'], position: Vector3, supportedBy?: string) => {
    const name = id + '/' + key; anchors.push({ id: name, kind, position, normal: [0, 1, 0], ...(supportedBy ? { supportedBy: id + '/' + supportedBy } : {}) }); return name;
  };
  add('lower-floor', 'floor', v(-width / 2 - P.wall / 2, -P.slab, lo - P.wall / 2), v(width / 2 + P.wall / 2, 0, hi + P.wall / 2), 'floor');
  const hole = stair.width / 2 + .1;
  add('upper-floor/left', 'floor', v(-width / 2 - P.wall / 2, stair.rise - P.slab, lo - P.wall / 2), v(-hole, stair.rise, hi + P.wall / 2), 'floor');
  add('upper-floor/right', 'floor', v(hole, stair.rise - P.slab, lo - P.wall / 2), v(width / 2 + P.wall / 2, stair.rise, hi + P.wall / 2), 'floor');
  add('upper-floor/lower', 'floor', v(-hole, stair.rise - P.slab, lo - P.wall / 2), v(hole, stair.rise, 0), 'floor');
  add('upper-floor/upper', 'floor', v(-hole, stair.rise - P.slab, stair.run), v(hole, stair.rise, hi + P.wall / 2), 'floor');
  add('roof', 'ceiling', v(-width / 2 - P.wall / 2, roof, lo - P.wall / 2), v(width / 2 + P.wall / 2, roof + P.slab, hi + P.wall / 2));
  for (const side of [-1, 1]) {
    const x = side * width / 2;
    add(`wall/side/${side}`, 'wall', v(x - P.wall / 2, 0, lo + P.wall / 2), v(x + P.wall / 2, roof, hi - P.wall / 2), 'stone', 2);
    const z = side < 0 ? lo : hi, floor = side < 0 ? 0 : stair.rise;
    add(`wall/${side}/left`, 'wall', v(-width / 2 - P.wall / 2, 0, z - P.wall / 2), v(-P.doorWidth / 2, roof, z + P.wall / 2));
    add(`wall/${side}/right`, 'wall', v(P.doorWidth / 2, 0, z - P.wall / 2), v(width / 2 + P.wall / 2, roof, z + P.wall / 2));
    add(`wall/${side}/lintel`, 'wall', v(-P.doorWidth / 2, floor + P.doorHeight, z - P.wall / 2), v(P.doorWidth / 2, roof, z + P.wall / 2));
    if (floor) add(`wall/${side}/base`, 'wall', v(-P.doorWidth / 2, 0, z - P.wall / 2), v(P.doorWidth / 2, floor, z + P.wall / 2));
    anchors.push({ id: id + `/approach/${side}`, kind: 'door', position: v(0, floor, z), normal: v(0, 0, -side),
      clearance: { min: v(-hole, floor, z - .5), max: v(hole, floor + 2.7, z + .5) } });
  }
  // The full decks own both landings; retain the recipe's exact tread/riser objects.
  for (const part of stair.model.payload.geometries.flight.filter(p => p.size && !p.id.endsWith('landing'))) {
    const min = part.position.map((v, i) => v - part.size![i] / 2) as Vector3, max = part.position.map((v, i) => v + part.size![i] / 2) as Vector3;
    add('flight/' + part.id, 'floor', min, max, part.id.startsWith('tread') ? 'floor' : 'stone', 0);
  }
  const beamTop = stair.rise - P.slab, beamBottom = beamTop - .268;
  for (const side of [-1, 1]) {
    const x = side * 1.36, tops: string[] = [];
    for (const [i, z] of [0, stair.run / 2, stair.run].entries()) {
      const foot = anchor(`post/${side}/${i}/foot`, 'foundation', v(x, 0, z), 'lower-floor');
      const top = anchor(`post/${side}/${i}/top`, 'post-top', v(x, beamBottom, z), `post/${side}/${i}`); tops.push(top);
      add(`post/${side}/${i}`, 'post', v(x - .16, 0, z - .16), v(x + .16, beamBottom, z + .16), 'timber', 1, [foot, top]);
    }
    for (let i = 0; i < 2; i++) add(`shaft-beam/${side}/${i}`, 'joist', v(x - .192, beamBottom, stair.run * i / 2),
      v(x + .192, beamTop, stair.run * (i + 1) / 2), 'timber', 2, [tops[i], tops[i + 1]]);
  }
  anchors.push({ id: id + '/lower-landing', kind: 'door', position: [...stair.anchors.lower], normal: [0, 0, 1] },
    { id: id + '/upper-landing', kind: 'door', position: [...stair.anchors.upper], normal: [0, 0, -1] });
  const plan: ConstructionPlan = { version: 'construction-plan-v1', profile: 'stairwell-assembly-v1', id,
    frame: { units: 'world', axes: 'right-handed-y-up', forward: '-z' },
    brief: { id, seed: 42, purpose: 'stairwell', rise: stair.rise, tread: stair.run / stair.steps, steps: stair.steps },
    bounds: { min: v(-width / 2 - P.wall / 2, -P.slab, lo - P.wall / 2), max: v(width / 2 + P.wall / 2, roof + P.slab, hi + P.wall / 2) },
    members, anchors, furnishings: [], routes: [{ min: v(-1.1, 0, -stair.landing), max: v(1.1, stair.rise + 2.7, stair.run + stair.landing) }] };
  validateConstructionPlan(plan); return plan;
}
