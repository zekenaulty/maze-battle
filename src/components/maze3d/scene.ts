import type { Direction, GridPosition } from '../../domain/types';
import type { GameView } from '../../services/game/GameView';
import type { ObservedCell } from '../../persistence/canonical/knowledge/types';
import { DIRECTIONS, MAX_VISIBLE_CELLS } from '../../persistence/canonical/knowledge/types';
import { currentVisibleCell } from '../../viewModels/canonicalPerceivedMaze';
import { opposite } from '../../domain/maze/movement';
import { CELL_SIZE, DOOR_HEIGHT, DOOR_WIDTH, WALL_HEIGHT } from './constants';
import { spatialBinding, type ConnectorSight } from '../../services/game/SpatialView';
import { floorPoint, type FloorFrame } from '../../domain/expedition/vertical';

export type Point = { x: number; z: number };
export interface Bounds2D { minX: number; maxX: number; minZ: number; maxZ: number }
export interface SceneBox { id: string; material: string; center: [number, number, number]; size: [number, number, number]; solid: boolean; facing?: Direction }
export interface StageCell { key: string; source: ObservedCell; center: Point; floorY: number; seed: number; kind: 'room' | 'passage' }
export interface StageConnector { sight: ConnectorSight; binding: string; upper: Point & { y: number }; lower: Point & { y: number } }
export interface StageScene {
  version: 'canonical-stage-v1'; scope: string; origin: GridPosition; level: number; actor: StageCell;
  cells: StageCell[]; boxes: SceneBox[]; colliders: Bounds2D[];
  originFrame?: FloorFrame; connector?: StageConnector;
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

/** Only current disclosed observations enter this compiler; no world reader, writer or full plan. */
export function compileStageScene(game: Pick<GameView, 'id' | 'snapshot' | 'checkpoint' | 'observation' | 'spatial'>, origin?: GridPosition, originFrame?: FloorFrame): StageScene | undefined {
  const actor = currentVisibleCell(game);
  if (!actor || !game.observation || game.observation.cells.length > MAX_VISIBLE_CELLS) return undefined;
  const base = origin ?? actor.world, level = actor.at.level;
  const spatial = game.spatial;
  if (spatial && spatial.binding !== spatialBinding(game.snapshot)) throw new Error('Stale connector disclosure');
  const initialFrame = originFrame ?? spatial?.frame, currentFrame = spatial?.frame ?? [0, 0, 0];
  const point = (frame: FloorFrame, at: GridPosition) => {
    const p = floorPoint(frame, at);
    return { x: p[0] - base.column * CELL_SIZE - (initialFrame?.[0] ?? 0), y: p[1] - (initialFrame?.[1] ?? 0),
      z: p[2] - base.row * CELL_SIZE - (initialFrame?.[2] ?? 0) };
  };
  const sight = spatial?.connector;
  const connector: StageConnector | undefined = sight ? { sight, binding: spatial!.binding,
    upper: point(sight.placement.upperFrame, sight.upperPoint), lower: point(sight.placement.lowerFrame, sight.lowerPoint) } : undefined;
  if (sight && (sight.cells.length > 5 || sight.cells.some(c => c.at.level === level || c.chests.length || c.stairs.length))) throw new Error('Invalid landing disclosure');
  const scope = JSON.stringify([game.id, game.snapshot.generation, spatial ? 'spatial-v1' : level]);
  const kinds = new Map(game.observation.header.spaces?.map(s => [s.spaceId, s.kind]));
  const cells = [...game.observation.cells.filter(c => c.at.level === level), ...(sight?.cells ?? [])].map(source => {
    const p = point(source.at.level === level ? currentFrame as FloorFrame : sight!.targetFrame, source.world);
    return { key: addressKey(source.at), source, center: { x: p.x, z: p.z }, floorY: p.y,
    seed: visualSeed(`canonical-stage-v1/${source.at.level}/${source.at.cell.spaceId}/${source.world.row}/${source.world.column}`),
    kind: kinds.get(source.at.cell.spaceId) ?? 'room',
  } as StageCell; }).sort((a, b) => a.source.world.row - b.source.world.row || a.source.world.column - b.source.world.column);
  const active = cells.find(c => c.key === addressKey(actor.at));
  const cellWorldKey = (c: ObservedCell) => `${c.at.level}/${worldKey(c.world)}`;
  if (!active || new Set(cells.map(c => cellWorldKey(c.source))).size !== cells.length) throw new Error('Invalid disclosed stage coordinates');
  const byWorld = new Map(cells.map(c => [cellWorldKey(c.source), c])), boxes: SceneBox[] = [];
  const box = (id: string, material: string, center: SceneBox['center'], size: SceneBox['size'], solid = true, facing?: Direction) =>
    boxes.push({ id, material, center, size, solid, ...(facing ? { facing } : {}) });
  if (connector && !connector.sight.cells.length) {
    const port = level === connector.sight.upper.level ? connector.upper : connector.lower;
    const sign = level === connector.sight.upper.level ? -1 : 1;
    box(`${connector.sight.id}/undisclosed-landing`, 'unknown', [port.x, port.y + 1.5, port.z + sign * .9], [1.8, 3, .12]);
  }
  for (const cell of cells) {
    const { x, z } = cell.center, y = cell.floorY, half = CELL_SIZE / 2;
    const end = connector && (cell.key === addressKey(connector.sight.upper) ? 'upper' : cell.key === addressKey(connector.sight.lower) ? 'lower' : undefined);
    const deck = (name: string, height: number, cut: boolean, sign: number) => {
      const material = name === 'floor' ? 'cobblestone' : 'stone_bricks';
      if (!cut) { box(`${cell.key}/${name}`, material, [x, height, z], [CELL_SIZE, .18, CELL_SIZE], false); return; }
      const side = (CELL_SIZE - 1.8) / 2;
      for (const s of [-1, 1]) box(`${cell.key}/${name}/side-${s}`, material, [x + s * (1.8 + side) / 2, height, z], [side, .18, CELL_SIZE], false);
      box(`${cell.key}/${name}/landing`, material, [x, height, z - sign * .35], [1.8, .18, 2.5], false);
    };
    deck('floor', y - .09, end === 'upper', -1);
    deck('ceiling', y + WALL_HEIGHT + .09, end === 'lower', 1);
    for (const direction of DIRECTIONS) {
      const { x: dx, z: dz } = directionVector[direction];
      const neighbour = byWorld.get(`${cell.source.at.level}/${worldKey({ row: cell.source.world.row + dz, column: cell.source.world.column + dx })}`);
      const ownsBoundary = !neighbour || direction === 'west' || direction === 'north';
      const target = cell.source.edges[direction], knownOpen = target != null && neighbour?.key === addressKey(target);
      const doorway = knownOpen && target.cell.spaceId !== cell.source.at.cell.spaceId;
      if (knownOpen && !doorway) continue;
      const edge = `${cell.key}/${direction}`, cx = x + dx * half, cz = z + dz * half, horizontal = !!dz;
      const panel = (suffix: string, offset: number, width: number, height: number, bottom = 0, material = 'stone_bricks') => {
        if (width <= 0) return;
        box(`${edge}/${suffix}`, material, [cx + (horizontal ? offset : 0), y + bottom + height / 2, cz + (horizontal ? 0 : offset)],
          horizontal ? [width, height, 0.16] : [0.16, height, width], bottom < 2.7 && cell.source.at.level === level);
      };
      if ((end === 'upper' && direction === 'north') || (end === 'lower' && direction === 'south')) {
        const side = (CELL_SIZE - 1.8) / 2;
        panel('stair-left', -(1.8 + side) / 2, side, WALL_HEIGHT);
        panel('stair-right', (1.8 + side) / 2, side, WALL_HEIGHT);
      } else if (doorway && ownsBoundary) {
        const side = (CELL_SIZE - DOOR_WIDTH) / 2;
        panel('left', -(DOOR_WIDTH + side) / 2, side, WALL_HEIGHT);
        panel('right', (DOOR_WIDTH + side) / 2, side, WALL_HEIGHT);
        panel('lintel', 0, DOOR_WIDTH, WALL_HEIGHT - DOOR_HEIGHT, DOOR_HEIGHT);
      } else if (!doorway) {
        if (ownsBoundary) panel('wall', 0, CELL_SIZE, WALL_HEIGHT, 0, target === null ? 'stone_bricks' : 'unknown');
        // Deterministic thin shelves remain outside the central walking lane and every opening.
        const random = seededRandom(visualSeed(`${cell.seed}/${direction}`));
        if (!end && target === null && cell.kind === 'room' && random() < 0.25) {
          box(`${edge}/shelf`, 'bookshelf', [cx - dx * 0.25, y + 1.1, cz - dz * 0.25],
            horizontal ? [1.5, 2.2, 0.34] : [0.34, 2.2, 1.5], cell.source.at.level === level, opposite(direction));
        }
      }
    }
    for (const chest of cell.source.chests) box(`${cell.key}/chest/${chest.id}`, 'chest', [x + 0.95, y + 0.52, z + 0.95], [1.05, 1.04, 1.05]);
  }
  const colliders = boxes.filter(b => b.solid).map(boxBounds);
  // Planar movement cannot sidestep into the shaft. The admitted walking surface owns this volume.
  if (connector) colliders.push({ minX: connector.upper.x - .9, maxX: connector.upper.x + .9,
    minZ: connector.lower.z + .9, maxZ: connector.upper.z - .9 });
  return { version: 'canonical-stage-v1', scope, origin: { ...base }, level, actor: active, cells, boxes, colliders,
    ...(initialFrame ? { originFrame: [...initialFrame] as FloorFrame } : {}), ...(connector ? { connector } : {}) };
}
