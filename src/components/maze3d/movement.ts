import type { Direction } from '../../domain/types';
import { CELL_SIZE, PLAYER_RADIUS, WALK_SPEED } from './constants';
import { addressKey, directionVector } from './scene';
import type { Bounds2D, Point, StageScene } from './scene';

export function diskBlocked(point: Point, boxes: Bounds2D[], radius = PLAYER_RADIUS) {
  return boxes.some(b => {
    const dx = point.x - Math.max(b.minX, Math.min(point.x, b.maxX)), dz = point.z - Math.max(b.minZ, Math.min(point.z, b.maxZ));
    return dx * dx + dz * dz < radius * radius - 1e-8;
  });
}
/** Swept substeps prevent thin-wall tunnelling; separated axes allow wall sliding. */
export function slideDisk(point: Point, delta: Point, boxes: Bounds2D[], radius = PLAYER_RADIUS): Point {
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / (radius * 0.4)));
  if (steps > 1024) throw new RangeError('Movement exceeds bounded sweep');
  const result = { ...point };
  for (let i = 0; i < steps; i++) {
    const x = { x: result.x + delta.x / steps, z: result.z };
    if (!diskBlocked(x, boxes, radius)) result.x = x.x;
    const z = { x: result.x, z: result.z + delta.z / steps };
    if (!diskBlocked(z, boxes, radius)) result.z = z.z;
  }
  return result;
}
export interface Crossing { direction: Direction; source: string; target: string }
/** Sub-cell presentation pose. Crossing a cell is gated by an awaited canonical command. */
export class StageWalker {
  position: Point;
  pending?: Crossing;
  scene: StageScene;
  constructor(scene: StageScene) { this.scene = scene; this.position = { ...scene.actor.center }; }
  update(scene: StageScene) {
    const old = this.scene, crossing = this.pending;
    this.scene = scene;
    if (scene.scope !== old.scope) { this.position = { ...scene.actor.center }; this.pending = undefined; return; }
    if (scene.actor.key !== old.actor.key) {
      if (crossing?.target === scene.actor.key) {
        const v = directionVector[crossing.direction];
        this.position = { x: this.position.x + v.x * 0.015, z: this.position.z + v.z * 0.015 };
      } else this.position = { ...scene.actor.center };
      if (crossing?.target !== scene.actor.key) this.pending = undefined;
    }
  }
  settle(crossing: Crossing) { const applied = this.scene.actor.key === crossing.target; this.pending = undefined; return applied; }
  advance(seconds: number, forward: number, strafe: number, yaw: number): Crossing | undefined {
    if (this.pending || !Number.isFinite(seconds) || seconds <= 0) return;
    const length = Math.max(1, Math.hypot(forward, strafe)), distance = Math.min(seconds, 0.05) * WALK_SPEED;
    const delta = { x: (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) / length * distance,
      z: (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) / length * distance };
    const next = slideDisk(this.position, delta, this.scene.colliders), center = this.scene.actor.center, half = CELL_SIZE / 2;
    const direction: Direction | undefined = next.x > center.x + half ? 'east' : next.x < center.x - half ? 'west'
      : next.z > center.z + half ? 'south' : next.z < center.z - half ? 'north' : undefined;
    if (direction) {
      const target = this.scene.actor.source.edges[direction];
      const visible = target && this.scene.cells.find(cell => cell.key === addressKey(target));
      this.position = { x: Math.max(center.x - half + 0.001, Math.min(next.x, center.x + half - 0.001)),
        z: Math.max(center.z - half + 0.001, Math.min(next.z, center.z + half - 0.001)) };
      if (!visible) return;
      this.pending = { direction, source: this.scene.actor.key, target: visible.key }; return this.pending;
    }
    this.position = next;
  }
}
