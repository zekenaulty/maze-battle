import type { Point, SceneBox } from './scene';
import { PLAYER_RADIUS } from './constants';
import { shelfYaw } from './shelving';
export function cabinetSweeps(box: SceneBox): SceneBox[] {
  const yaw = shelfYaw[box.facing ?? 'south'], c = Math.cos(yaw), s = Math.sin(yaw), foot = box.center[1] - box.size[1] / 2;
  return [[-.9424, -.004513392449661749], [.004513392449661749, .9424]].map(([lo, hi], i) => {
    const x = (lo + hi) / 2, z = (.192 + 1.0898866075503383) / 2;
    return { id: box.id + '/sweep/' + i, material: 'reservation', center: [box.center[0] + c * x + s * z, foot + .88, box.center[2] - s * x + c * z],
      size: [Math.abs(c) * (hi - lo) + Math.abs(s) * (1.0898866075503383 - .192), 1.76,
        Math.abs(s) * (hi - lo) + Math.abs(c) * (1.0898866075503383 - .192)], solid: false };
  });
}
export function cabinetClearance(box: SceneBox, obstacles: SceneBox[], player: Point, footY: number) {
  const sweeps = cabinetSweeps(box), overlap = (a: SceneBox, b: SceneBox) => a.center.every((v, i) => Math.abs(v - b.center[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);
  const actor: SceneBox = { id: 'actor', material: 'actor', center: [player.x, footY + 1.35, player.z], size: [PLAYER_RADIUS * 2, 2.7, PLAYER_RADIUS * 2], solid: true };
  if (sweeps.some(s => overlap(s, actor))) return 'Step back to leave room for the cabinet doors.';
  if (sweeps.some(s => obstacles.some(b => b.id !== box.id && !b.deck && overlap(s, b)))) return 'The cabinet doors need more clearance.';
}
/** A short segment to the front must not pass through another visible solid. */
export function cabinetVisible(from: Point, target: Point, footY: number, boxes: SceneBox[], id: string) {
  return !boxes.some(b => {
    if (b.id === id || b.deck || b.center[1] + b.size[1] / 2 < footY + .8 || b.center[1] - b.size[1] / 2 > footY + 1.5) return false;
    let lo = 0, hi = 1;
    for (const [axis, key] of [[0, 'x'], [2, 'z']] as const) {
      const delta = target[key] - from[key], min = b.center[axis] - b.size[axis] / 2, max = b.center[axis] + b.size[axis] / 2;
      if (Math.abs(delta) < 1e-8) { if (from[key] <= min || from[key] >= max) return false; }
      else { const a = (min - from[key]) / delta, z = (max - from[key]) / delta; lo = Math.max(lo, Math.min(a, z)); hi = Math.min(hi, Math.max(a, z)); }
    }
    return lo < hi - 1e-6 && hi > 1e-6 && lo < 1 - 1e-6;
  });
}
