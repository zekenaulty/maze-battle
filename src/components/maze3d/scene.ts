import type { Direction, GridPosition } from '../../domain/types';
import type { GameView } from '../../services/game/GameView';
import type { ObservedCell } from '../../persistence/canonical/knowledge/types';
import { DIRECTIONS, MAX_VISIBLE_CELLS } from '../../persistence/canonical/knowledge/types';
import { currentVisibleCell } from '../../viewModels/canonicalPerceivedMaze';
import { CELL_SIZE, DOOR_HEIGHT, DOOR_WIDTH, WALL_HEIGHT } from './constants';

export type Point = { x: number; z: number };
export interface Bounds2D { minX: number; maxX: number; minZ: number; maxZ: number }
export interface SceneBox { id: string; material: string; center: [number, number, number]; size: [number, number, number]; solid: boolean }
export interface StageCell { key: string; source: ObservedCell; center: Point; seed: number; kind: 'room' | 'passage' }
export interface StageScene {
  version: 'canonical-stage-v1'; scope: string; origin: GridPosition; level: number; actor: StageCell;
  cells: StageCell[]; boxes: SceneBox[]; colliders: Bounds2D[];
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
export function compileStageScene(game: Pick<GameView, 'id' | 'snapshot' | 'checkpoint' | 'observation'>, origin?: GridPosition): StageScene | undefined {
  const actor = currentVisibleCell(game);
  if (!actor || !game.observation || game.observation.cells.length > MAX_VISIBLE_CELLS) return undefined;
  const base = origin ?? actor.world, level = actor.at.level;
  const scope = JSON.stringify([game.id, game.snapshot.generation, level]);
  const kinds = new Map(game.observation.header.spaces?.map(s => [s.spaceId, s.kind]));
  const cells = game.observation.cells.filter(c => c.at.level === level).map(source => ({
    key: addressKey(source.at), source, center: { x: (source.world.column - base.column) * CELL_SIZE, z: (source.world.row - base.row) * CELL_SIZE },
    seed: visualSeed(`canonical-stage-v1/${level}/${source.at.cell.spaceId}/${source.world.row}/${source.world.column}`),
    kind: kinds.get(source.at.cell.spaceId) ?? 'room',
  } as StageCell)).sort((a, b) => a.source.world.row - b.source.world.row || a.source.world.column - b.source.world.column);
  const active = cells.find(c => c.key === addressKey(actor.at));
  if (!active || new Set(cells.map(c => worldKey(c.source.world))).size !== cells.length) throw new Error('Invalid disclosed stage coordinates');
  const byWorld = new Map(cells.map(c => [worldKey(c.source.world), c])), boxes: SceneBox[] = [];
  const box = (id: string, material: string, center: SceneBox['center'], size: SceneBox['size'], solid = true) => boxes.push({ id, material, center, size, solid });
  for (const cell of cells) {
    const { x, z } = cell.center, half = CELL_SIZE / 2;
    box(`${cell.key}/floor`, 'cobblestone', [x, -0.09, z], [CELL_SIZE, 0.18, CELL_SIZE], false);
    box(`${cell.key}/ceiling`, 'stone_bricks', [x, WALL_HEIGHT + 0.09, z], [CELL_SIZE, 0.18, CELL_SIZE], false);
    for (const direction of DIRECTIONS) {
      const { x: dx, z: dz } = directionVector[direction];
      const neighbour = byWorld.get(worldKey({ row: cell.source.world.row + dz, column: cell.source.world.column + dx }));
      const ownsBoundary = !neighbour || direction === 'west' || direction === 'north';
      const target = cell.source.edges[direction], knownOpen = target != null && neighbour?.key === addressKey(target);
      const doorway = knownOpen && target.cell.spaceId !== cell.source.at.cell.spaceId;
      if (knownOpen && !doorway) continue;
      const edge = `${cell.key}/${direction}`, cx = x + dx * half, cz = z + dz * half, horizontal = !!dz;
      const panel = (suffix: string, offset: number, width: number, height: number, bottom = 0, material = 'stone_bricks') => {
        if (width <= 0) return;
        box(`${edge}/${suffix}`, material, [cx + (horizontal ? offset : 0), bottom + height / 2, cz + (horizontal ? 0 : offset)],
          horizontal ? [width, height, 0.16] : [0.16, height, width], bottom < 2.7);
      };
      if (doorway && ownsBoundary) {
        const side = (CELL_SIZE - DOOR_WIDTH) / 2;
        panel('left', -(DOOR_WIDTH + side) / 2, side, WALL_HEIGHT);
        panel('right', (DOOR_WIDTH + side) / 2, side, WALL_HEIGHT);
        panel('lintel', 0, DOOR_WIDTH, WALL_HEIGHT - DOOR_HEIGHT, DOOR_HEIGHT);
      } else if (!doorway) {
        if (ownsBoundary) panel('wall', 0, CELL_SIZE, WALL_HEIGHT, 0, target === null ? 'stone_bricks' : 'unknown');
        // Deterministic thin shelves remain outside the central walking lane and every opening.
        const random = seededRandom(visualSeed(`${cell.seed}/${direction}`));
        if (target === null && cell.kind === 'room' && random() < 0.25) {
          box(`${edge}/shelf`, 'bookshelf', [cx - dx * 0.25, 1.1, cz - dz * 0.25],
            horizontal ? [1.5, 2.2, 0.34] : [0.34, 2.2, 1.5]);
        }
      }
    }
    for (const chest of cell.source.chests) box(`${cell.key}/chest/${chest.id}`, 'chest', [x + 0.95, 0.52, z + 0.95], [1.05, 1.04, 1.05]);
  }
  return { version: 'canonical-stage-v1', scope, origin: { ...base }, level, actor: active, cells, boxes, colliders: boxes.filter(b => b.solid).map(boxBounds) };
}
