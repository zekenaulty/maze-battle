// Joint motion adapted from skinview3d/src/animation.ts (MIT), 84906e983a2cf325f33f515b9a71c871f799054b.
// No cape, flight, actor movement or command authority is included. See THIRD_PARTY_NOTICES/skinview3d-LICENSE.txt.
import { PARTS } from './uv';
import type { HumanoidPart } from './uv';
export type HumanoidAnimation = 'neutral' | 'idle' | 'walk' | 'run';
export type HumanoidPose = Record<HumanoidPart, [number, number, number]>;
export const neutralPose = (): HumanoidPose => Object.fromEntries(PARTS.map(p => [p, [0, 0, 0]])) as HumanoidPose;
export function humanoidPose(mode: HumanoidAnimation, seconds: number): HumanoidPose {
  const p = neutralPose(), t = Math.max(0, seconds) * (mode === 'run' ? 15 : mode === 'walk' ? 8 : 2);
  if (mode === 'neutral') return p;
  const basic = Math.PI * (mode === 'run' ? 0.1 : 0.02), sway = mode === 'run' ? 0.1 : 0.03;
  p.leftArm[2] = Math.cos(t) * sway + basic; p.rightArm[2] = Math.cos(t + Math.PI) * sway - basic;
  if (mode === 'walk' || mode === 'run') {
    const amplitude = mode === 'run' ? 1.1 : 0.5;
    p.leftLeg[0] = Math.sin(t) * amplitude; p.rightLeg[0] = -p.leftLeg[0];
    p.leftArm[0] = -Math.sin(t) * amplitude; p.rightArm[0] = -p.leftArm[0];
    if (mode === 'walk') { p.head[1] = Math.sin(t / 4) * 0.2; p.head[0] = Math.sin(t / 5) * 0.1; }
  }
  return p;
}
export function blendPose(from: HumanoidPose, to: HumanoidPose, progress: number): HumanoidPose {
  const a = Math.min(1, Math.max(0, progress)), smooth = a * a * (3 - 2 * a);
  return Object.fromEntries(PARTS.map(part => [part, from[part].map((n, axis) => n + (to[part][axis] - n) * smooth)])) as HumanoidPose;
}
