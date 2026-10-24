import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readCanonicalRegion, type KnowledgeRegion, type KnowledgeRegionScope } from '../persistence/canonical/knowledge/region';
import type { CanonicalSnapshot } from '../persistence/canonical/types';
import { currentCanonicalPerception, type PerceptionFrame, type PerceptionGame } from '../viewModels/currentCanonicalPerception';

interface RegionView { key: string; region?: KnowledgeRegion; error?: string }
export function useMazePerception(snapshot: CanonicalSnapshot, input: KnowledgeRegionScope, game?: PerceptionGame, enabled = true) {
  const snapshotKey = JSON.stringify(snapshot), scopeKey = JSON.stringify(input), key = `${snapshotKey}:${scopeKey}`;
  const pinned = useMemo(() => JSON.parse(snapshotKey) as CanonicalSnapshot, [snapshotKey]);
  const scope = useMemo(() => JSON.parse(scopeKey) as KnowledgeRegionScope, [scopeKey]);
  const [view, setView] = useState<RegionView>({ key: '' });
  const displayed = useRef<PerceptionFrame>(undefined);
  useEffect(() => {
    if (!enabled) return;
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
  }, [pinned, scope, key, enabled]);
  const retained = view.key === key ? view : undefined;
  const region = useMemo(() => !enabled || retained?.error ? undefined : retained?.region
    ?? (game ? currentCanonicalPerception(game, scope, displayed.current) : undefined), [enabled, retained, game, scope]);
  useLayoutEffect(() => { displayed.current = region && game ? { game, region } : undefined; }, [region, game]);
  return { region, pending: enabled && !retained, error: enabled ? retained?.error : undefined };
}
