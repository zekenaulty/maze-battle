/** Explicit comparison allowlist. Coordinates, semantic IDs, sequence/revision, costs and times stay exact. */
export function corpusNormalizer() {
  const identities = new Map<string, string>();
  const identity = (value: string) => {
    if (!identities.has(value)) identities.set(value, `identity-${identities.size}`);
    return identities.get(value)!;
  };
  function visit(value: unknown, path = ''): unknown {
    if (Array.isArray(value)) return value.map((child, index) => visit(child, `${path}/${index}`));
    if (!value || typeof value !== 'object') return value;
    const row = value as Record<string, unknown>, result: Record<string, unknown> = {};
    const source = typeof row.sequence === 'number' && typeof row.id === 'string'
      && Object.keys(row).every(key => ['sequence', 'id', 'index', 'revision', 'observedAt'].includes(key));
    const publication = Object.keys(row).sort().join() === 'id,key'
      && typeof row.key === 'string' && row.key.startsWith('agentica/publications/');
    const starter = /^\/inventory\/items\/\d+$/.test(path)
      && ['health-herb', 'mana-vial', 'town-portal'].includes(row.baseId as string);
    for (const [key, child] of Object.entries(row)) {
      if ((source && key === 'id') || (starter && key === 'id') || publication || key === 'observationId'
        || path.endsWith('/header') && key === 'owner') {
        if (typeof child !== 'string') throw Error('Malformed identity in comparison allowlist');
        result[key] = identity(child);
      } else if (path.endsWith('/header') && key === 'chunks') {
        if (!Array.isArray(child) || child.some(id => typeof id !== 'string')) throw Error('Malformed observation chunk IDs');
        result[key] = child.map(identity);
      } else if ((key === 'frontier' || key === 'next') && typeof child === 'string') {
        const token = JSON.parse(child);
        if (token.schema !== 1 || !token.publication) throw Error('Unrecognized comparison token');
        result[key] = JSON.stringify(visit(token, `${path}/${key}`));
      } else result[key] = visit(child, `${path}/${key}`);
    }
    return result;
  }
  return { normalize: visit, identities };
}
