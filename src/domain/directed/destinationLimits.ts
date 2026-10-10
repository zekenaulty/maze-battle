/** Null removes a policy ceiling, never custody, storage or route-residency checks. */
export interface DestinationLimits {
  steps: number | null;
  replans: number | null;
  durationMs: number | null;
}

export const DEFAULT_DESTINATION_LIMITS: Readonly<DestinationLimits> = Object.freeze({
  steps: 64, replans: 4, durationMs: 120_000,
});

export function snapshotDestinationLimits(value: unknown = DEFAULT_DESTINATION_LIMITS): DestinationLimits {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== 3) throw new Error('Invalid destination limits.');
  const limits = value as DestinationLimits;
  for (const name of ['steps', 'replans', 'durationMs'] as const) {
    const limit = limits[name];
    if (!Object.hasOwn(value, name) || (limit !== null && (!Number.isSafeInteger(limit) || limit < 0))) {
      throw new Error(`Invalid destination limit: ${name}.`);
    }
  }
  return { ...limits };
}

export const limitReached = (used: number, limit: number | null) => limit !== null && used >= limit;
export const exceedsLimit = (used: number, limit: number | null) => limit !== null && used > limit;

export function destinationDeadline(startedAt: number, limits: DestinationLimits): number | null {
  if (!Number.isSafeInteger(startedAt) || startedAt < 0
    || (limits.durationMs !== null && !Number.isSafeInteger(startedAt + limits.durationMs))) {
    throw new Error('Invalid destination time bound.');
  }
  return limits.durationMs === null ? null : startedAt + limits.durationMs;
}

export function destinationExpired(operation: { deadline: number | null }, now: number): boolean {
  return !Number.isSafeInteger(now) || now < 0 || (operation.deadline !== null && now >= operation.deadline);
}
