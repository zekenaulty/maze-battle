import type { Direction } from '../../domain/types';
import { CELL_SIZE, PLAYER_RADIUS, WALK_SPEED } from './constants';
import { addressKey, directionVector } from './scene';
import type { Bounds2D, Point, StageScene } from './scene';
import { StairTraversal, type StairCrossing } from './StairTraversal';
import { STAIR_RECIPE } from '../../domain/expedition/vertical';

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
export const PREDICTION_LIMIT = 0.8;
export interface Crossing { direction: Direction; source: string; target: string; sourceCenter: Point; sourcePosition: Point }
/** Sub-cell presentation pose; one disclosed neighbour may be predicted while its command commits. */
export class StageWalker {
  position: Point;
  pending?: Crossing;
  scene: StageScene;
  stairs?: StairTraversal;
  get floorY() { return this.stairs?.pose.y ?? this.scene.actor.floorY; }
  constructor(scene: StageScene) { this.scene = scene; this.position = { ...scene.actor.center }; }
  update(scene: StageScene) {
    const old = this.scene, crossing = this.pending;
    this.scene = scene;
    if (this.stairs) {
      const connector = scene.connector, pending = this.stairs.pending;
      if (scene.scope === old.scope && connector?.sight.id === this.stairs.connector.sight.id
        && (pending ? [addressKey(pending.source), addressKey(pending.target)].includes(scene.actor.key)
          : old.actor.key === scene.actor.key && old.connector?.binding === connector.binding)) return;
      this.cancelStairs();
    }
    if (scene.scope !== old.scope) { this.position = { ...scene.actor.center }; this.pending = undefined; return; }
    if (scene.actor.key !== old.actor.key) {
      if (crossing?.target !== scene.actor.key) this.position = { ...scene.actor.center };
      if (crossing?.target !== scene.actor.key) this.pending = undefined;
    }
  }
  settle(crossing: Crossing) {
    if (this.pending !== crossing) return false;
    const applied = this.scene.actor.key === crossing.target;
    if (!applied) this.position = { ...crossing.sourcePosition };
    this.pending = undefined; return applied;
  }
  reject(crossing: Crossing) { if (this.pending === crossing) this.settle(crossing); }
  cancelStairs() { if (!this.stairs) return; this.stairs = undefined; this.position = { x: this.scene.actor.center.x, z: this.scene.actor.center.z }; }
  settleStairs(crossing: StairCrossing) {
    const stairs = this.stairs;
    if (stairs?.pending !== crossing) return false;
    if (!stairs.accept(this.scene.actor.source.at)) { this.cancelStairs(); return false; }
    stairs.connector = this.scene.connector!;
    return true;
  }
  /** The reserved strip is deliberately absent from ordinary planar move links. */
  advanceStairs(seconds: number, forward: number, strafe: number, yaw: number): { handled: boolean; crossing?: StairCrossing } {
    const length = Math.max(1, Math.hypot(forward, strafe));
    const delta = { x: (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) / length,
      z: (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) / length };
    const connector = this.scene.connector;
    if (!this.stairs && connector && connector.sight.cells.length && !this.pending
      && [addressKey(connector.sight.upper), addressKey(connector.sight.lower)].includes(this.scene.actor.key)) {
      const upper = this.scene.actor.key === addressKey(connector.sight.upper), anchor = upper ? connector.upper : connector.lower;
      if (Math.abs(this.position.x - anchor.x) <= STAIR_RECIPE.width / 2 - PLAYER_RADIUS
        && Math.abs(this.position.z - anchor.z) <= STAIR_RECIPE.landing / 2
        && (upper ? delta.z < -.1 : delta.z > .1)) this.stairs = new StairTraversal(connector, upper ? 'upper' : 'lower', this.position);
    }
    if (!this.stairs) return { handled: false };
    const crossing = this.stairs.advance(seconds, delta), pose = this.stairs.pose;
    this.position = { x: pose.x, z: pose.z };
    if (this.stairs.atLanding && (this.stairs.committed === 'upper' ? delta.z > 0 : delta.z < 0)) {
      this.stairs = undefined; return { handled: true };
    }
    return { handled: true, crossing };
  }
  private predictionTarget(point: Point, crossing: Crossing): Point {
    const center = crossing.sourceCenter, half = CELL_SIZE / 2, v = directionVector[crossing.direction];
    const clamp = (value: number, middle: number, direction: number) => direction
      ? middle + direction * Math.max(half + 0.001, Math.min((value - middle) * direction, half + PREDICTION_LIMIT))
      : Math.max(middle - half + 0.001, Math.min(value, middle + half - 0.001));
    return { x: clamp(point.x, center.x, v.x), z: clamp(point.z, center.z, v.z) };
  }
  advance(seconds: number, forward: number, strafe: number, yaw: number): Crossing | undefined {
    if (!Number.isFinite(seconds) || seconds <= 0 || !(forward || strafe)) return;
    const length = Math.max(1, Math.hypot(forward, strafe)), distance = Math.min(seconds, 0.05) * WALK_SPEED;
    const delta = { x: (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) / length * distance,
      z: (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) / length * distance };
    if (this.pending) {
      const target = this.predictionTarget({ x: this.position.x + delta.x, z: this.position.z + delta.z }, this.pending);
      // Clamp the requested sweep, never teleport a post-collision result into a prop.
      this.position = slideDisk(this.position, { x: target.x - this.position.x, z: target.z - this.position.z }, this.scene.colliders);
      return;
    }
    const next = slideDisk(this.position, delta, this.scene.colliders), center = this.scene.actor.center, half = CELL_SIZE / 2;
    const direction: Direction | undefined = next.x > center.x + half ? 'east' : next.x < center.x - half ? 'west'
      : next.z > center.z + half ? 'south' : next.z < center.z - half ? 'north' : undefined;
    if (direction) {
      const target = this.scene.actor.source.edges[direction];
      const visible = target && this.scene.cells.find(cell => cell.key === addressKey(target));
      if (!visible) {
        const bounded = { x: Math.max(center.x - half + 0.001, Math.min(next.x, center.x + half - 0.001)),
          z: Math.max(center.z - half + 0.001, Math.min(next.z, center.z + half - 0.001)) };
        this.position = slideDisk(this.position, { x: bounded.x - this.position.x, z: bounded.z - this.position.z }, this.scene.colliders); return;
      }
      const crossing = { direction, source: this.scene.actor.key, target: visible.key, sourceCenter: { ...center }, sourcePosition: { ...this.position } };
      const bounded = this.predictionTarget(next, crossing);
      this.position = slideDisk(this.position, { x: bounded.x - this.position.x, z: bounded.z - this.position.z }, this.scene.colliders);
      const v = directionVector[direction];
      if ((this.position.x - center.x) * v.x + (this.position.z - center.z) * v.z <= half) return;
      this.pending = crossing;
      return this.pending;
    }
    this.position = next;
  }
}
