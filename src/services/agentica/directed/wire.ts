import { canonicalJson } from '../sdk/agentica-host.mjs';

/** Normalize typed wire fields only, never arbitrary historical observation.data. */
export function equivalentHostWire(a: unknown, b: unknown, kind: 'event' | 'result') {
  const normalize = (input: unknown) => {
    const value = structuredClone(input) as Record<string, unknown>;
    if (!value || typeof value !== 'object') return value;
    for (const name of kind === 'event' ? ['completion', 'nextSessionEpoch', 'usage'] : ['completion', 'operation', 'observation']) {
      if (value[name] === null) delete value[name];
    }
    const observation = value.observation as Record<string, unknown> | undefined;
    if (observation && typeof observation.observedAt === 'string') {
      const date = observation.observedAt, fraction = date.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1];
      // Hosts here persist millisecond precision. Never hide extra nonzero precision.
      if (Number.isFinite(Date.parse(date)) && (!fraction || !/[1-9]/.test(fraction.slice(3)))) {
        observation.observedAt = new Date(date).toISOString();
      }
    }
    return value;
  };
  return canonicalJson(normalize(a)) === canonicalJson(normalize(b));
}
