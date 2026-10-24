import type { Volume, StairAssembly } from './assembly';
import { stairSupport } from './assembly';

export interface FootPose { x: number; y: number; z: number }
export function bodyBlocked(foot: FootPose, volumes: Volume[], radius = 0.38, height = 2.7) {
  return volumes.some(box => {
    if (foot.y + height <= box.min[1] + 1e-7 || foot.y >= box.max[1] - 1e-7) return false;
    const dx = foot.x - Math.max(box.min[0], Math.min(foot.x, box.max[0]));
    const dz = foot.z - Math.max(box.min[2], Math.min(foot.z, box.max[2]));
    return dx * dx + dz * dz < radius * radius - 1e-8;
  });
}
/** Isolated S2 locomotion proof. Canonical admission is added by the connector controller, not this fixture. */
export class StairFixtureWalker {
  pose: FootPose;
  cameraY: number;
  stair: StairAssembly;
  readonly eyeHeight = 2.25;
  private obstacles: Volume[];
  constructor(stair: StairAssembly, obstacles: Volume[] = []) {
    this.stair = stair; this.obstacles = obstacles;
    this.pose = { x: 0, y: 0, z: -stair.landing / 2 }; this.cameraY = this.eyeHeight;
  }
  reset(upper = false) { this.pose = { x: 0, y: upper ? this.stair.rise : 0, z: upper ? this.stair.run + this.stair.landing / 2 : -this.stair.landing / 2 }; this.cameraY = this.pose.y + this.eyeHeight; }
  advance(seconds: number, deltaX: number, deltaZ: number) {
    if (![seconds, deltaX, deltaZ].every(Number.isFinite) || seconds <= 0) return;
    const dt = Math.min(seconds, 0.05), distance = Math.hypot(deltaX, deltaZ) * dt;
    const substeps = Math.max(1, Math.ceil(distance / 0.12));
    const { run, landing, width } = this.stair;
    for (let i = 0; i < substeps; i++) {
      const z = Math.max(-landing - 3, Math.min(run + landing + 3, this.pose.z + deltaZ * dt / substeps));
      const onFlight = z >= -0.38 && z <= run + 0.38;
      const halfWidth = (onFlight ? width / 2 : 3.5) - 0.38;
      const x = Math.max(-halfWidth, Math.min(halfWidth, this.pose.x + deltaX * dt / substeps));
      const candidate = { x, z, y: stairSupport(this.stair, z) };
      if (!bodyBlocked(candidate, this.obstacles)) this.pose = candidate;
    }
    const target = this.pose.y + this.eyeHeight;
    this.cameraY += (target - this.cameraY) * (1 - Math.exp(-18 * dt));
  }
}
