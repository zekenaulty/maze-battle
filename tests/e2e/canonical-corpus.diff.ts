/** Evidence-only JSON field differences. No field, counter, coordinate or error is normalized. */
export function corpusDifferences(left: unknown, right: unknown, path = ''): {
  path: string; left: { present: boolean; value?: unknown }; right: { present: boolean; value?: unknown };
}[] {
  if (Object.is(left, right)) return [];
  if (left && right && typeof left === 'object' && typeof right === 'object'
    && Array.isArray(left) === Array.isArray(right)) {
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(key => {
      const child = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      const a = { present: Object.hasOwn(left, key), value: Reflect.get(left, key) };
      const b = { present: Object.hasOwn(right, key), value: Reflect.get(right, key) };
      return a.present !== b.present ? [{ path: child, left: a, right: b }]
        : corpusDifferences(a.value, b.value, child);
    });
  }
  return [{ path, left: { present: true, value: left }, right: { present: true, value: right } }];
}
