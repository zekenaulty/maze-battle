export const AUTO_THROTTLE_MIN_MS = 250;
export const AUTO_THROTTLE_MAX_MS = 2000;
export const AUTO_THROTTLE_STEP_MS = 50;
export const DEFAULT_AUTO_THROTTLE_MS = 500;
export const AUTO_MAZE_MIN_MS = 750;
export const WAVE_RESTART_MIN_MS = 450;

export function normalizeAutoThrottleMs(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_AUTO_THROTTLE_MS;
  }

  const stepped = Math.round((value ?? DEFAULT_AUTO_THROTTLE_MS) / AUTO_THROTTLE_STEP_MS) * AUTO_THROTTLE_STEP_MS;
  return Math.max(AUTO_THROTTLE_MIN_MS, Math.min(AUTO_THROTTLE_MAX_MS, stepped));
}

export function formatAutoThrottle(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(milliseconds % 1000 === 0 ? 0 : 2).replace(/0$/, '')}s`;
}
