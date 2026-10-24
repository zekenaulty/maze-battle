import type { TextureAnimation } from './manifest';

export function animationDuration(animation: TextureAnimation) {
  return animation.timeline.reduce((sum, step) => sum + step.durationMs, 0);
}
/** Time-based sampling preserves repeated/out-of-order frames and individual dwell times. */
export function animationSample(animation: TextureAnimation, elapsedMs: number) {
  const total = animationDuration(animation);
  let time = Math.max(0, elapsedMs);
  time = animation.loop ? time % total : Math.min(time, total);
  let step = 0;
  while (step < animation.timeline.length - 1 && time >= animation.timeline[step].durationMs) time -= animation.timeline[step++].durationMs;
  return { step, frame: animation.timeline[step].frame };
}
export function animationStepTime(animation: TextureAnimation, step: number) {
  return animation.timeline.slice(0, Math.max(0, Math.min(step, animation.timeline.length - 1))).reduce((sum, s) => sum + s.durationMs, 0);
}
export class AnimationClock {
  elapsedMs = 0;
  playing = true;
  speed = 1;
  private last?: number;
  advance(timestamp: number) {
    if (this.last !== undefined && this.playing) this.elapsedMs += Math.max(0, timestamp - this.last) * this.speed;
    this.last = timestamp;
    return this.elapsedMs;
  }
  seek(elapsedMs: number) { this.elapsedMs = Math.max(0, elapsedMs); this.last = undefined; }
}
