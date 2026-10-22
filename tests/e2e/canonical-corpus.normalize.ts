import { readGraphCursor } from '../../src/persistence/canonical/knowledge/graph.cursor';
import { observationHeader } from '../../src/persistence/canonical/knowledge/validation';

/** Explicit comparison allowlist. Coordinates, semantic IDs, sequence/revision, costs and times stay exact. */
export function corpusNormalizer() {
  const identities = new Map<string, string>();
  const identity = (value: string) => {
    if (!identities.has(value)) identities.set(value, `identity-${identities.size}`);
    return identities.get(value)!;
  };
  function visit(value: unknown, path = '', graphAnchorPath = ''): unknown {
    if (Array.isArray(value)) return value.map((child, index) => visit(child, `${path}/${index}`, graphAnchorPath));
    if (!value || typeof value !== 'object') return value;
    const row = value as Record<string, unknown>, result: Record<string, unknown> = {};
    // Full-record integrity commits include random IDs. Raw controlled-ID proof remains separate.
    const sightHeader = path === '/sight/header';
    if (sightHeader) observationHeader(row);
    const source = typeof row.sequence === 'number' && typeof row.id === 'string'
      && Object.keys(row).every(key => ['sequence', 'id', 'index', 'revision', 'observedAt'].includes(key));
    const publication = Object.keys(row).sort().join() === 'id,key'
      && typeof row.key === 'string' && row.key.startsWith('agentica/publications/');
    const graphAnchor = !!graphAnchorPath && path === graphAnchorPath && Object.keys(row).sort().join() === 'id,sequence,witness';
    const starter = /^\/inventory\/items\/\d+$/.test(path)
      && ['health-herb', 'mana-vial', 'town-portal'].includes(row.baseId as string);
    for (const [key, child] of Object.entries(row)) {
      if ((source && key === 'id') || (graphAnchor && (key === 'id' || key === 'witness'))
        || (starter && key === 'id') || publication || key === 'observationId'
        || sightHeader && (key === 'owner' || key === 'chunksDigest')) {
        if (typeof child !== 'string') throw Error('Malformed identity in comparison allowlist');
        result[key] = identity(child);
      } else if (sightHeader && key === 'chunks') {
        if (!Array.isArray(child) || child.some(id => typeof id !== 'string')) throw Error('Malformed observation chunk IDs');
        result[key] = child.map(identity);
      } else if ((key === 'frontier' || key === 'next') && typeof child === 'string') {
        const token = JSON.parse(child);
        if (token.schema !== 1 || !token.publication) throw Error('Unrecognized comparison token');
        result[key] = JSON.stringify(visit(token, `${path}/${key}`));
      } else if (key === 'after' && typeof child === 'string' && row.schema === 1 && row.publication
        && Object.keys(row).sort().join() === 'after,publication,query,schema') {
        const query = row.query as { scope: string; level: number; spaceId?: string };
        if (query.scope !== 'map' && query.scope !== 'links') { result[key] = child; continue; }
        const token = JSON.parse(child);
        readGraphCursor(child, token.anchor, query.scope === 'map'
          ? { scope: 'nodes', level: query.level, kind: 'room' }
          : { scope: 'links', level: query.level, spaceId: query.spaceId! });
        result[key] = JSON.stringify(visit(token, `${path}/${key}`, `${path}/${key}/anchor`));
      } else result[key] = visit(child, `${path}/${key}`, graphAnchorPath);
    }
    return result;
  }
  return { normalize: visit, identities };
}
