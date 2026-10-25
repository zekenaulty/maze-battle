import type { Direction, GridPosition } from '../../domain/types';
import type { GameView } from '../../services/game/GameView';
import type { ObservedCell } from '../../persistence/canonical/knowledge/types';
import { DIRECTIONS, MAX_VISIBLE_CELLS } from '../../persistence/canonical/knowledge/types';
import { currentVisibleCell } from '../../viewModels/canonicalPerceivedMaze';
import { opposite } from '../../domain/maze/movement';
import { CELL_SIZE, DOOR_HEIGHT, DOOR_WIDTH, WALL_HEIGHT } from './constants';
import { spatialBinding, MAX_STAIR_ROOMS, MAX_STAIR_ROOM_CELLS, type ConnectorSight } from '../../services/game/SpatialView';
import { floorPoint, STAIR_RECIPE, type FloorFrame } from '../../domain/expedition/vertical';

export type Point = { x: number; z: number };
export interface Bounds2D { minX: number; maxX: number; minZ: number; maxZ: number }
export interface SceneBox { id: string; material: string; center: [number, number, number]; size: [number, number, number]; solid: boolean; facing?: Direction; deck?: 'floor' | 'ceiling' }
export interface StageCell { key: string; source: ObservedCell; center: Point; floorY: number; seed: number; kind: 'room' | 'passage'; geometryEdges?: ObservedCell['edges'] }
export interface StageConnector { sight: ConnectorSight; binding: string; upper: Point & { y: number }; lower: Point & { y: number } }
export interface StageFlight { id: string; upper: Point & { y: number }; lower: Point & { y: number } }
export interface StageDoor { id: string; center: [number, number, number]; horizontal: boolean }
export interface StageScene {
  version: 'canonical-stage-v1'; scope: string; origin: GridPosition; level: number; actor: StageCell;
  cells: StageCell[]; boxes: SceneBox[]; colliders: Bounds2D[];
  originFrame?: FloorFrame; connector?: StageConnector;
  connectors?: StageConnector[]; flights?: StageFlight[]; doors?: StageDoor[]; roomCount?: number;
}
export const directionVector: Record<Direction, Point> = { north: { x: 0, z: -1 }, east: { x: 1, z: 0 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 } };
export const addressKey = (at: ObservedCell['at']) => JSON.stringify([at.level, at.cell.spaceId, at.cell.row, at.cell.column]);
const worldKey = (world: GridPosition) => `${world.row}:${world.column}`;

/** Versioned visual RNG, independent of gameplay RNG, visitation order and observation revision. */
export function visualSeed(identity: string) {
  let hash = 2166136261;
  for (const c of identity) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function boxBounds(box: SceneBox): Bounds2D {
  return { minX: box.center[0] - box.size[0] / 2, maxX: box.center[0] + box.size[0] / 2,
    minZ: box.center[2] - box.size[2] / 2, maxZ: box.center[2] + box.size[2] / 2 };
}
/** The flight opening belongs to both faces of a shared floor/ceiling slab. */
export function cutStairDecks(input: SceneBox[], flights: StageFlight[]) {
  let boxes = input;
  for (const flight of flights) boxes = boxes.flatMap(box => {
    if (!box.deck || Math.abs(box.center[1] + box.size[1] / 2 - flight.upper.y) > 1e-5) return [box];
    const b = boxBounds(box), x0 = Math.max(b.minX, flight.upper.x - .9), x1 = Math.min(b.maxX, flight.upper.x + .9);
    const z0 = Math.max(b.minZ, flight.lower.z + .9), z1 = Math.min(b.maxZ, flight.upper.z - .9);
    if (x0 >= x1 - 1e-6 || z0 >= z1 - 1e-6) return [box];
    return [[b.minX, x0, b.minZ, b.maxZ], [x1, b.maxX, b.minZ, b.maxZ], [x0, x1, b.minZ, z0], [x0, x1, z1, b.maxZ]]
      .filter(([a, b, c, d]) => b - a > 1e-6 && d - c > 1e-6).map(([a, b, c, d], i): SceneBox => ({ ...box,
        id: box.id + '/opening-' + flight.id + '/' + i, center: [(a + b) / 2, box.center[1], (c + d) / 2], size: [b - a, box.size[1], d - c] }));
  });
  return boxes;
}

/** Structural stair rooms are visible; navigation still uses the exact primary actor observation. */
export function compileStageScene(game: Pick<GameView, 'id' | 'snapshot' | 'checkpoint' | 'observation' | 'spatial'>, origin?: GridPosition, originFrame?: FloorFrame): StageScene | undefined {
  const actor = currentVisibleCell(game);
  if (!actor || !game.observation || game.observation.cells.length > MAX_VISIBLE_CELLS) return undefined;
  const base = origin ?? actor.world, level = actor.at.level, spatial = game.spatial;
  if (spatial && spatial.binding !== spatialBinding(game.snapshot)) throw new Error('Stale connector disclosure');
  const initialFrame = originFrame ?? spatial?.frame, currentFrame: FloorFrame = spatial?.frame ?? [0, 0, 0];
  const point = (frame: FloorFrame, at: GridPosition) => {
    const p = floorPoint(frame, at);
    return { x: p[0] - base.column * CELL_SIZE - (initialFrame?.[0] ?? 0), y: p[1] - (initialFrame?.[1] ?? 0),
      z: p[2] - base.row * CELL_SIZE - (initialFrame?.[2] ?? 0) };
  };
  const sights = spatial?.connectors ?? (spatial?.connector ? [spatial.connector] : []);
  if (sights.length > 2) throw new Error('Connector budget exceeded');
  const connectors: StageConnector[] = sights.map(sight => ({ sight, binding: spatial!.binding,
    upper: point(sight.placement.upperFrame, sight.upperPoint), lower: point(sight.placement.lowerFrame, sight.lowerPoint) }));
  const flights: StageFlight[] = [...connectors.map(c => ({ id: c.sight.id, upper: c.upper, lower: c.lower }))];
  const ends = new Map<string, 'upper' | 'lower'>();
  for (const c of connectors) { ends.set(addressKey(c.sight.upper), 'upper'); ends.set(addressKey(c.sight.lower), 'lower'); }
  for (const port of spatial?.ports ?? []) {
    const p = point(port.frame, port.world); ends.set(addressKey(port.at), port.end);
    if (!flights.some(f => f.id === port.id)) flights.push({ id: port.id,
      upper: port.end === 'upper' ? p : { x: p.x, y: p.y + STAIR_RECIPE.rise, z: p.z + STAIR_RECIPE.separation },
      lower: port.end === 'lower' ? p : { x: p.x, y: p.y - STAIR_RECIPE.rise, z: p.z - STAIR_RECIPE.separation } });
  }
  const rooms = spatial?.rooms ?? [];
  if (rooms.length > MAX_STAIR_ROOMS || rooms.reduce((n, r) => n + r.cells.length, 0) > MAX_STAIR_ROOM_CELLS) throw new Error('Room sight budget exceeded');
  const scope = JSON.stringify([game.id, game.snapshot.generation, spatial ? 'spatial-v1' : level]);
  const kinds = new Map(game.observation.header.spaces?.map(s => [s.spaceId, s.kind]));
  const cellMap = new Map<string, StageCell>();
  const addCell = (source: ObservedCell, frame: FloorFrame, kind: StageCell['kind'], primary = false) => {
    const p = point(frame, source.world), key = addressKey(source.at), prior = cellMap.get(key);
    cellMap.set(key, { key, source, center: { x: p.x, z: p.z }, floorY: p.y,
      seed: visualSeed('canonical-stage-v1/' + source.at.level + '/' + source.at.cell.spaceId + '/' + source.world.row + '/' + source.world.column),
      kind, ...(primary && prior ? { geometryEdges: prior.source.edges } : {}) });
  };
  for (const room of rooms) {
    if (room.cells.length > 225 || room.voids.length > 6 || room.cells.some(c => c.at.level !== room.level || c.at.cell.spaceId !== room.spaceId || c.chests.length)) throw new Error('Invalid structural room');
    for (const cell of room.cells) addCell(cell, room.frame, room.kind);
  }
  if (!rooms.length) for (const sight of sights) {
    if (sight.cells.length > 5 || sight.cells.some(c => c.at.level === level || c.chests.length || c.stairs.length)) throw new Error('Invalid landing disclosure');
    for (const cell of sight.cells) addCell(cell, sight.targetFrame, 'room');
  }
  for (const cell of game.observation.cells.filter(c => c.at.level === level)) addCell(cell, currentFrame, kinds.get(cell.at.cell.spaceId) ?? 'room', true);
  const cells = [...cellMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const active = cellMap.get(addressKey(actor.at));
  const cellWorldKey = (c: ObservedCell) => c.at.level + '/' + worldKey(c.world);
  if (!active || new Set(cells.map(c => cellWorldKey(c.source))).size !== cells.length) throw new Error('Invalid disclosed stage coordinates');
  const byWorld = new Map(cells.map(c => [cellWorldKey(c.source), c])), boxes: SceneBox[] = [], doors: StageDoor[] = [];
  const box = (id: string, material: string, center: SceneBox['center'], size: SceneBox['size'], solid = true, facing?: Direction) =>
    boxes.push({ id, material, center, size, solid, ...(facing ? { facing } : {}),
      ...(/\/floor(?:\/|$)/.test(id) ? { deck: 'floor' as const } : /\/ceiling(?:\/|$)/.test(id) ? { deck: 'ceiling' as const } : {}) });
  for (const cell of cells) {
    const { x, z } = cell.center, y = cell.floorY, half = CELL_SIZE / 2, end = ends.get(cell.key);
    const deck = (name: string, height: number, cut: boolean, sign: number) => {
      const material = name === 'floor' ? 'cobblestone' : 'stone_bricks';
      if (!cut) { box(cell.key + '/' + name, material, [x, height, z], [CELL_SIZE, .18, CELL_SIZE], false); return; }
      const side = (CELL_SIZE - STAIR_RECIPE.width) / 2;
      for (const s of [-1, 1]) box(cell.key + '/' + name + '/side-' + s, material,
        [x + s * (STAIR_RECIPE.width + side) / 2, height, z], [side, .18, CELL_SIZE], false);
      box(cell.key + '/' + name + '/landing', material, [x, height, z - sign * .35], [STAIR_RECIPE.width, .18, 2.5], false);
    };
    deck('floor', y - .09, end === 'upper', -1); deck('ceiling', y + WALL_HEIGHT + .09, end === 'lower', 1);
    for (const direction of DIRECTIONS) {
      const { x: dx, z: dz } = directionVector[direction];
      const neighbour = byWorld.get(cell.source.at.level + '/' + worldKey({ row: cell.source.world.row + dz, column: cell.source.world.column + dx }));
      const ownsBoundary = !neighbour || direction === 'west' || direction === 'north';
      const target = (cell.geometryEdges ?? cell.source.edges)[direction], knownOpen = target != null;
      const doorway = knownOpen && target.cell.spaceId !== cell.source.at.cell.spaceId;
      if (knownOpen && !doorway) continue;
      const edge = cell.key + '/' + direction, cx = x + dx * half, cz = z + dz * half, horizontal = !!dz;
      const panel = (suffix: string, offset: number, width: number, height: number, bottom = 0, material = 'stone_bricks') => {
        if (width <= 0) return;
        box(edge + '/' + suffix, material, [cx + (horizontal ? offset : 0), y + bottom + height / 2, cz + (horizontal ? 0 : offset)],
          horizontal ? [width, height, .16] : [.16, height, width], bottom < 2.7 && cell.source.at.level === level);
      };
      if (end === 'upper' && direction === 'north' || end === 'lower' && direction === 'south') {
        const side = (CELL_SIZE - STAIR_RECIPE.width) / 2;
        panel('stair-left', -(STAIR_RECIPE.width + side) / 2, side, WALL_HEIGHT);
        panel('stair-right', (STAIR_RECIPE.width + side) / 2, side, WALL_HEIGHT);
      } else if (doorway && ownsBoundary) {
        const side = (CELL_SIZE - DOOR_WIDTH) / 2;
        panel('left', -(DOOR_WIDTH + side) / 2, side, WALL_HEIGHT); panel('right', (DOOR_WIDTH + side) / 2, side, WALL_HEIGHT);
        panel('lintel', 0, DOOR_WIDTH, WALL_HEIGHT - DOOR_HEIGHT, DOOR_HEIGHT);
        doors.push({ id: [cell.key, addressKey(target)].sort().join('|'), center: [cx, y, cz], horizontal });
      } else if (!doorway) {
        if (ownsBoundary) panel('wall', 0, CELL_SIZE, WALL_HEIGHT, 0, target === null ? 'stone_bricks' : 'unknown');
        const random = seededRandom(visualSeed(cell.seed + '/' + direction));
        if (!end && target === null && cell.kind === 'room' && random() < .25) box(edge + '/shelf', 'bookshelf',
          [cx - dx * .25, y + 1.1, cz - dz * .25], horizontal ? [1.5, 2.2, .34] : [.34, 2.2, 1.5], cell.source.at.level === level, opposite(direction));
      }
    }
    for (const chest of cell.source.chests) box(cell.key + '/chest/' + chest.id, 'chest', [x + .95, y + .52, z + .95], [1.05, 1.04, 1.05]);
  }
  // A reserved shaft opens one deck, not both: retain the upper roof and the lower structural floor.
  for (const room of rooms) for (const hole of room.voids) {
    const p = point(room.frame, hole.world), id = room.id + '/shaft/' + worldKey(hole.world);
    if (!hole.floorOpen) box(id + '/floor', 'cobblestone', [p.x, p.y - .09, p.z], [CELL_SIZE, .18, CELL_SIZE], false);
    if (!hole.ceilingOpen) box(id + '/ceiling', 'stone_bricks', [p.x, p.y + WALL_HEIGHT + .09, p.z], [CELL_SIZE, .18, CELL_SIZE], false);
  }
  // Masonry cheeks close the gap between the 1.8-unit flight and the reserved cell shaft.
  for (const f of flights) {
    const shoulder = (CELL_SIZE - STAIR_RECIPE.width) / 2;
    for (let i = 0; i < STAIR_RECIPE.steps; i++) for (const sign of [-1, 1]) {
      const height = (i + 1) * STAIR_RECIPE.rise / STAIR_RECIPE.steps;
      box(f.id + '/cheek/' + i + '/' + sign, 'stone_bricks', [f.lower.x + sign * (STAIR_RECIPE.width + shoulder) / 2,
        f.lower.y + height / 2, f.lower.z + .9 + (i + .5) * STAIR_RECIPE.tread], [shoulder, height, STAIR_RECIPE.tread], false);
    }
  }
  const renderBoxes = cutStairDecks(boxes, flights);
  const colliders = renderBoxes.filter(b => b.solid).map(boxBounds);
  for (const flight of flights) colliders.push({ minX: flight.upper.x - .9, maxX: flight.upper.x + .9,
    minZ: flight.lower.z + .9, maxZ: flight.upper.z - .9 });
  const connector = connectors.find(c => [addressKey(c.sight.upper), addressKey(c.sight.lower)].includes(active.key)) ?? connectors[0];
  return { version: 'canonical-stage-v1', scope, origin: { ...base }, level, actor: active, cells, boxes: renderBoxes, colliders,
    ...(initialFrame ? { originFrame: [...initialFrame] as FloorFrame } : {}), ...(connector ? { connector } : {}),
    connectors, flights, doors, roomCount: rooms.length };
}
