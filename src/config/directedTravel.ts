import { DEFAULT_DESTINATION_LIMITS, snapshotDestinationLimits, type DestinationLimits } from '../domain/directed/destinationLimits';

const settings = { steps: 'VITE_MAZE_TRAVEL_STEPS', replans: 'VITE_MAZE_TRAVEL_REPLANS',
  durationMs: 'VITE_MAZE_TRAVEL_DURATION_MS' } as const;

/** Read at admission only. Changing deployment config cannot renew a saved allowance. */
export function configuredDestinationLimits(env: Record<string, unknown> = import.meta.env): DestinationLimits {
  const result = { ...DEFAULT_DESTINATION_LIMITS };
  for (const field of Object.keys(settings) as (keyof DestinationLimits)[]) {
    const name = settings[field], input = env[name];
    if (input === undefined) continue;
    if (typeof input !== 'string') throw new Error(`Invalid ${name}: expected an integer or unlimited.`);
    const value = input.trim().toLowerCase();
    if (value === 'unlimited' || value === 'none') result[field] = null;
    else if (/^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))) result[field] = Number(value);
    else throw new Error(`Invalid ${name}: expected a nonnegative integer or unlimited.`);
  }
  return snapshotDestinationLimits(result);
}
