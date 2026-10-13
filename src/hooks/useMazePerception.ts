import { useEffect, useMemo, useState } from 'react';
import { readCanonicalRegion, type KnowledgeRegion, type KnowledgeRegionScope } from '../persistence/canonical/knowledge/region';
import type { CanonicalSnapshot } from '../persistence/canonical/types';

interface RegionView { key: string; region?: KnowledgeRegion; error?: string }
export function useMazePerception(snapshot: CanonicalSnapshot, input: KnowledgeRegionScope) {
  const snapshotKey = JSON.stringify(snapshot), scopeKey = JSON.stringify(input), key = `${snapshotKey}:${scopeKey}`;
  const pinned = useMemo(() => JSON.parse(snapshotKey) as CanonicalSnapshot, [snapshotKey]);
  const scope = useMemo(() => JSON.parse(scopeKey) as KnowledgeRegionScope, [scopeKey]);
  const [view, setView] = useState<RegionView>({ key: '' });
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await readCanonicalRegion(pinned, scope, controller.signal);
        if (!controller.signal.aborted) setView({ key, region: result.value });
      } catch {
        if (!controller.signal.aborted) setView({ key, error: 'Map evidence unavailable' });
      }
    })();
    return () => controller.abort();
  }, [pinned, scope, key]);
  const retained = view.key === key ? view : undefined;
  return { region: retained?.region, pending: !retained, error: retained?.error };
}
