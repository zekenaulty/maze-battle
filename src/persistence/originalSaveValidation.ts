export function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected an object`);
  return value as Record<string, unknown>;
}

export function number(value: unknown, path: string, min = 0, max = 1_000_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${path}: expected a finite number in ${min}..${max}`);
  }
  return value;
}

export function integer(value: unknown, path: string, min = 0, max = 1_000_000_000): number {
  const result = number(value, path, min, max);
  if (!Number.isInteger(result)) throw new Error(`${path}: expected an integer`);
  return result;
}

export function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path}: expected a boolean`);
  return value;
}

export function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${path}: expected an array of at most ${max} entries`);
  return value;
}
