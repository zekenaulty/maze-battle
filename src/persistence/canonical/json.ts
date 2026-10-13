const encoder = new TextEncoder();

/** Bound validation work before serialization; reject accessors, cycles and non-JSON objects. */
export function boundedJsonBytes(value: unknown, max: number): number {
  const fail = () => { throw new Error(`Canonical storage: invalid JSON or record exceeds ${max} bytes`); };
  if (!Number.isSafeInteger(max) || max < 1) fail();
  const active = new Set<object>();
  let visited = 0, lowerBytes = 0;
  const visit = (current: unknown, depth: number) => {
    if (++visited > max || depth > 32) fail();
    if (current === null || typeof current === 'boolean') lowerBytes += 4;
    else if (typeof current === 'number') { if (!Number.isFinite(current)) fail(); lowerBytes++; }
    else if (typeof current === 'string') { lowerBytes += current.length + 2; }
    else {
      if (!current || typeof current !== 'object' || active.has(current)) return fail();
      const array = Array.isArray(current), proto = Object.getPrototypeOf(current);
      if (!array && proto !== Object.prototype && proto !== null) fail();
      const keys = Reflect.ownKeys(current);
      if (keys.length > max || keys.some(key => typeof key !== 'string')) fail();
      if (array && keys.length !== current.length + 1) fail();
      lowerBytes += 2; active.add(current);
      let entries = 0;
      for (const key of keys) {
        if (array && key === 'length') continue;
        if (array && (!/^(0|[1-9][0-9]*)$/.test(String(key)) || Number(key) >= current.length)) fail();
        const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
        lowerBytes += (entries++ ? 1 : 0) + (array ? 0 : String(key).length + 3);
        if (lowerBytes > max) fail();
        visit(descriptor.value, depth + 1);
      }
      active.delete(current);
    }
    if (lowerBytes > max) fail();
  };
  visit(value, 0);
  const bytes = encoder.encode(JSON.stringify(value)).byteLength;
  if (bytes > max) fail();
  return bytes;
}
