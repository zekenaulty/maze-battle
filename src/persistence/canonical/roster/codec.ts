import type { Json } from '../types';
import { check, integer, isObject, jsonBytes, validId } from '../validation';

/** Only explicitly named optional domain fields may be omitted. Stored values are never repaired. */
export function encodeRoster(value: unknown, optionalPaths: readonly string[] = []): Json {
  const seen = new Set<object>();
  const omissions = optionalPaths.map(path => path.split('.'));
  let visited = 0;
  function visit(input: unknown, path: string[], depth: number): Json {
    check(depth <= 16 && ++visited <= 65536, 'roster value exceeds work bound');
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') { check(Number.isFinite(input), 'nonfinite roster number'); return input; }
    check(typeof input === 'object' && input !== null && !seen.has(input), 'invalid roster value');
    seen.add(input);
    try {
      const array = Array.isArray(input), keys = Reflect.ownKeys(input);
      check(array || Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null, 'nonplain roster value');
      check(keys.length <= 65536 && keys.every(key => typeof key === 'string'), 'unsupported roster keys');
      check(!array || keys.length === input.length + 1, 'non-JSON roster array');
      const entries: [string, Json][] = [];
      for (const key of keys as string[]) {
        if (array && key === 'length') continue;
        check(!array || /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < input.length, 'non-JSON array property');
        const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
        check(descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'unsupported roster descriptor');
        const at = [...path, array ? '*' : key];
        if (!array && descriptor.value === undefined && omissions.some(allowed => allowed.length === at.length
          && allowed.every((segment, i) => segment === at[i]))) continue;
        entries.push([key, visit(descriptor.value, at, depth + 1)]);
      }
      return array ? entries.map(([, child]) => child) : Object.fromEntries(entries);
    } finally { seen.delete(input); }
  }
  const result = visit(value, [], 0); jsonBytes(result); return result;
}

export function fields(value: unknown, required: string, optional = '') {
  check(isObject(value), 'invalid roster object');
  const keys = required.split(' ').filter(Boolean), allowed = new Set([...keys, ...optional.split(' ').filter(Boolean)]);
  check(keys.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => allowed.has(key)), 'invalid roster fields');
  return value;
}
export function text(value: unknown, max = 160): asserts value is string {
  check(typeof value === 'string' && value.length > 0 && value.length <= max, 'invalid roster text');
}
export function number(value: unknown, min = 0): asserts value is number {
  check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= Number.MAX_SAFE_INTEGER, 'invalid roster number');
}
export function optionalNumber(value: unknown) { if (value !== undefined) number(value); }
export function optionalBoolean(value: unknown) { check(value === undefined || typeof value === 'boolean', 'invalid roster flag'); }
export function id(value: unknown): asserts value is string { check(validId(value), 'invalid roster identity'); }
export function natural(value: unknown, min = 0): asserts value is number { check(integer(value, min), 'invalid roster integer'); }
export function timestamp(value: unknown): asserts value is string {
  text(value, 32); check(Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'invalid roster timestamp');
}
