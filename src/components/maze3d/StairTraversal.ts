import type { WorldPosition } from '../../persistence/canonical/world/types';
import { STAIR_RECIPE } from '../../domain/expedition/vertical';
import { addressKey, type Point, type StageConnector } from './scene';
import { PLAYER_RADIUS, WALK_SPEED } from './constants';

export interface StairCrossing { source: WorldPosition; target: WorldPosition; direction: 'up' | 'down'; binding: string }
/** Local presentation only. An accepted canonical endpoint is the sole durable location. */
export class StairTraversal {
  pending?: StairCrossing;
  progress: number;
  x: number;
  connector: StageConnector;
  committed: 'upper' | 'lower';
  constructor(connector: StageConnector, committed: 'upper' | 'lower', start?: Point) {
    this.connector = connector; this.committed = committed;
    this.progress = committed === 'upper' ? 0 : 1; this.x = connector.upper.x;
    if (start) { this.progress = (connector.upper.z - start.z) / STAIR_RECIPE.separation; this.x = start.x; }
  }
  get pose() {
    const { upper } = this.connector, distance = this.progress * STAIR_RECIPE.separation;
    const slope = Math.max(0, Math.min(1, (distance - STAIR_RECIPE.landing / 2) / (STAIR_RECIPE.tread * STAIR_RECIPE.steps)));
    return { x: this.x, y: upper.y - slope * STAIR_RECIPE.rise, z: upper.z - distance };
  }
  advance(seconds: number, delta: Point): StairCrossing | undefined {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const distance = Math.min(seconds, .05) * WALK_SPEED;
    this.x = Math.max(this.connector.upper.x - STAIR_RECIPE.width / 2 + PLAYER_RADIUS,
      Math.min(this.connector.upper.x + STAIR_RECIPE.width / 2 - PLAYER_RADIUS, this.x + delta.x * distance));
    // Outer half-landings preserve the approach pose, including approach from behind either anchor.
    let next = Math.max(-.1, Math.min(1.1, this.progress - delta.z * distance / STAIR_RECIPE.separation));
    if (this.connector.sight.travelReady === false) next = this.committed === 'upper' ? Math.min(.45, next) : Math.max(.55, next);
    if (this.pending) next = this.pending.direction === 'down' ? Math.max(.5, Math.min(.57, next)) : Math.max(.43, Math.min(.5, next));
    this.progress = next;
    if (!this.pending && this.connector.sight.travelReady !== false && (this.committed === 'upper' ? next >= .5 : next <= .5)) {
      const down = this.committed === 'upper', sight = this.connector.sight;
      this.pending = { source: down ? sight.upper : sight.lower, target: down ? sight.lower : sight.upper,
        direction: down ? 'down' : 'up', binding: this.connector.binding };
      return this.pending;
    }
  }
  accept(actor: WorldPosition) {
    if (!this.pending || addressKey(actor) !== addressKey(this.pending.target)) return false;
    this.committed = this.pending.direction === 'down' ? 'lower' : 'upper'; this.pending = undefined; return true;
  }
  get atLanding() { return !this.pending && (this.committed === 'upper' ? this.progress <= 0 : this.progress >= 1); }
}
