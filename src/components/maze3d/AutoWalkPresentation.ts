import { STAIR_RECIPE } from '../../domain/expedition/vertical';
import { CELL_SIZE } from './constants';
import { addressKey, type StageScene } from './scene';
import type { StageConnector } from './scene';

type Pose = { x: number; y: number; z: number };
interface Leg { from: Pose; to: Pose; source: string; target: string; distance: number; travelled: number; stair?: StageConnector }
const poseOf = (scene: StageScene): Pose => ({ ...scene.actor.center, y: scene.actor.floorY });
const distance = (a: Pose, b: Pose) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const connectors = (scene: StageScene) => scene.connectors ?? (scene.connector ? [scene.connector] : []);
export const MAX_AUTO_LEGS = 8;

/** A bounded visual replay of accepted moves. It never plans, predicts or sends commands. */
export class AutoWalkPresentation {
  pose: Pose;
  enabled = false;
  moving = false;
  heading?: number;
  pitch = 0;
  private legs: Leg[] = [];
  private lastMoveAt?: number;
  private cadence = .53;
  private speed = 0;
  private targetSpeed = 0;
  get queued() { return this.legs.length; }
  constructor(scene: StageScene) { this.pose = poseOf(scene); }
  private reset(scene: StageScene) {
    this.pose = poseOf(scene); this.legs = []; this.moving = false;
    this.speed = this.targetSpeed = 0; this.lastMoveAt = undefined; this.heading = undefined; this.pitch = 0;
  }
  update(previous: StageScene, next: StageScene, enabled: boolean, now: number, throttleMs: number) {
    if (!enabled || !this.enabled || previous.scope !== next.scope) {
      this.reset(next); this.enabled = enabled; this.cadence = Math.max(.08, throttleMs / 1000 + .03); return;
    }
    const visible = new Set(next.cells.map(cell => cell.key));
    if (this.legs.some(leg => !visible.has(leg.source) || !visible.has(leg.target)
      || leg.stair && !connectors(next).some(c => c.sight.id === leg.stair!.sight.id
        && JSON.stringify(c.sight.placement) === JSON.stringify(leg.stair!.sight.placement)))) { this.reset(next); return; }
    if (previous.actor.key === next.actor.key) return; // Content/preparation revisions do not restart a step.
    const from = poseOf(previous), to = poseOf(next);
    const adjacent = previous.level === next.level && Object.values(previous.actor.source.edges).some(at => at && addressKey(at) === next.actor.key)
      && Math.abs(distance(from, to) - CELL_SIZE) < .001
      && (Math.abs(from.x - to.x) < .001 || Math.abs(from.z - to.z) < .001);
    const stair = connectors(previous).find(c => [c.sight.upper, c.sight.lower].some(at => addressKey(at) === previous.actor.key)
      && [c.sight.upper, c.sight.lower].some(at => addressKey(at) === next.actor.key)
      && connectors(next).some(n => n.sight.id === c.sight.id && JSON.stringify(n.sight.placement) === JSON.stringify(c.sight.placement)));
    // Relocations/legacy floor changes and undisclosed routes have no invented animation.
    if ((!adjacent && !stair) || !visible.has(previous.actor.key) || this.legs.length >= MAX_AUTO_LEGS) { this.reset(next); return; }
    const interval = this.lastMoveAt === undefined ? undefined : now - this.lastMoveAt;
    if (interval !== undefined && interval > 0 && interval < Math.max(2, this.cadence * 2.5))
      this.cadence = .75 * this.cadence + .25 * interval;
    this.lastMoveAt = now;
    this.legs.push({ from, to, source: previous.actor.key, target: next.actor.key, distance: distance(from, to), travelled: 0, stair });
    const remaining = this.legs.reduce((sum, leg) => sum + leg.distance - leg.travelled, 0);
    // A small visual delay absorbs ordinary IO jitter; retained bends are never cut diagonally.
    this.targetSpeed = Math.min(80, Math.max(CELL_SIZE / Math.max(.08, this.cadence * 1.2), remaining / Math.max(.1, this.cadence * 1.5)));
  }
  advance(seconds: number) {
    this.moving = false;
    if (!this.enabled || !this.legs.length || !Number.isFinite(seconds) || seconds <= 0) return;
    const dt = Math.min(seconds, .05);
    this.speed += (this.targetSpeed - this.speed) * (1 - Math.exp(-12 * dt));
    let budget = this.speed * dt;
    while (this.legs.length && budget > 0) {
      const leg = this.legs[0], amount = Math.min(budget, leg.distance - leg.travelled);
      leg.travelled += amount; budget -= amount;
      const t = leg.travelled / leg.distance;
      this.heading = Math.atan2(-(leg.to.x - leg.from.x), -(leg.to.z - leg.from.z));
      if (leg.stair) {
        const upperToLower = leg.from.y > leg.to.y, progress = upperToLower ? t : 1 - t;
        const run = progress * STAIR_RECIPE.separation;
        const slope = Math.max(0, Math.min(1, (run - STAIR_RECIPE.landing / 2) / (STAIR_RECIPE.tread * STAIR_RECIPE.steps)));
        this.pose = { x: leg.stair.upper.x, y: leg.stair.upper.y - slope * STAIR_RECIPE.rise, z: leg.stair.upper.z - run };
        this.pitch = slope > 0 && slope < 1 ? (upperToLower ? -1 : 1) * .28 : 0;
      } else {
        this.pose = { x: leg.from.x + (leg.to.x - leg.from.x) * t, y: leg.from.y, z: leg.from.z + (leg.to.z - leg.from.z) * t };
        this.pitch = 0;
      }
      this.moving ||= amount > .000001;
      if (t >= 1 - 1e-8) { this.pose = { ...leg.to }; this.legs.shift(); }
    }
    if (!this.legs.length) this.speed = 0;
  }
}

/** Frame-rate independent shortest-arc camera steering, also bounded during a reversal. */
export function followAngle(current: number, target: number, seconds: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const dt = Math.max(0, Math.min(.05, seconds));
  return current + Math.max(-Math.PI * dt, Math.min(Math.PI * dt, delta * (1 - Math.exp(-10 * dt))));
}
