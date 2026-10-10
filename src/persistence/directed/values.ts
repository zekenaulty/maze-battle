import { DIRECTED_LIMITS } from '../../domain/directed/types';

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Directed storage: ${message}`);
}
export function object(value: unknown): asserts value is Record<string, unknown> {
  check(value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'invalid object');
}
export function id(value: unknown): asserts value is string {
  check(typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f]/.test(value), 'invalid identifier');
}
export function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  check(Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max, 'invalid sequence or bound');
}
export function text(value: unknown): asserts value is string {
  check(typeof value === 'string' && value.length <= 4096, 'invalid text');
}
export function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  check(required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), 'unexpected fields');
}
export function list(value: unknown, max: number = DIRECTED_LIMITS.cells): asserts value is unknown[] {
  check(Array.isArray(value) && value.length <= max, 'invalid array bound');
}
export function entries(value: unknown): [string, unknown][] {
  object(value);
  const result = Object.entries(value);
  check(result.length <= DIRECTED_LIMITS.cells, 'map bound exceeded');
  return result;
}
export const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;

/** Type tags preserve optional undefined fields without conflating them with data. */
export function canonical(value: unknown): string {
  let nodes = 0;
  const visit = (item: unknown, depth: number): unknown => {
    check(++nodes <= 100_000 && depth <= 24, 'serialization bound exceeded');
    if (item === undefined) return ['undefined'];
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return [typeof item, item];
    if (typeof item === 'number') { check(Number.isFinite(item), 'non-finite number'); return ['number', item]; }
    if (Array.isArray(item)) return ['array', Array.from(item, entry => visit(entry, depth + 1))];
    object(item);
    check(Reflect.ownKeys(item).length === Object.keys(item).length, 'non-JSON object properties');
    return ['object', Object.keys(item).sort().map(key => [key, visit(item[key], depth + 1)])];
  };
  return JSON.stringify(visit(value, 0));
}
export function serializable(value: unknown, maxBytes: number = DIRECTED_LIMITS.bytes * 8) {
  canonical(value);
  check(utf8Bytes(JSON.stringify(value)) <= maxBytes, 'serialized byte bound exceeded');
}
export const same = (left: unknown, right: unknown) => canonical(left) === canonical(right);
