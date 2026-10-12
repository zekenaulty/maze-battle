import { useEffect, useMemo, useState } from 'react';
import { readRpgHistory } from '../persistence/observationArchive';
import { prepareRpgMemory } from '../persistence/rpgMemory/prepare';
import { readRpgPerceptionRegion } from '../persistence/rpgMemory/perception';
import type { RpgObservation } from '../domain/agentic/knowledge/types';
import type { RpgPerceptionRegion, RpgPerceptionScope } from '../domain/agentic/knowledge/perceptionTypes';
import { currentPerception } from '../viewModels/currentPerception';

interface SourceView { key: string; observation?: RpgObservation; ancestors?: readonly string[]; ready?: boolean; error?: string }
interface RegionView { key: string; region?: RpgPerceptionRegion; error?: string }
const message = 'Map evidence unavailable';

export function useMazePerception(gameId: string, snapshotId: string | undefined, input: RpgPerceptionScope) {
  const sourceKey = JSON.stringify([gameId, snapshotId]);
  const scopeKey = JSON.stringify(input);
  const scope = useMemo(() => JSON.parse(scopeKey) as RpgPerceptionScope, [scopeKey]);
  const regionKey = `${sourceKey}:${scopeKey}`;
  const [source, setSource] = useState<SourceView>({ key: '' });
  const [view, setView] = useState<RegionView>({ key: '' });

  useEffect(() => {
    if (!snapshotId) return;
    const controller = new AbortController(), { signal } = controller;
    const run = async () => {
      try {
        const history = await readRpgHistory('auto', { snapshotId, limit: 1 });
        if (signal.aborted) return;
        const observation = history.records[0]?.observation;
        if (observation?.gameId !== gameId || observation.id !== snapshotId) throw new Error(message);
        const ancestors = history.records[0].ancestors;
        setSource({ key: sourceKey, observation, ancestors });
        for (;;) {
          const result = await prepareRpgMemory('auto', { snapshotId, maxSources: 1, signal });
          if (signal.aborted) return;
          if (result.status === 'ready') { setSource({ key: sourceKey, observation, ancestors, ready: true }); return; }
          if (result.status !== 'partial') throw new Error(message);
          await yieldPreparation(signal);
          if (signal.aborted) return;
        }
      } catch {
        if (!signal.aborted) setSource(previous => ({ ...(previous.key === sourceKey ? previous : {}), key: sourceKey, error: message }));
      }
    };
    void run();
    return () => controller.abort();
  }, [gameId, snapshotId, sourceKey]);

  const ready = source.key === sourceKey && source.ready;
  useEffect(() => {
    if (!ready || !snapshotId) return;
    const controller = new AbortController();
    void readRpgPerceptionRegion('auto', scope, snapshotId, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (result.status !== 'ready' || result.data.source.gameId !== gameId || result.snapshotId !== snapshotId) throw new Error(message);
      setView({ key: regionKey, region: result.data });
    }).catch(() => { if (!controller.signal.aborted) setView({ key: regionKey, error: message }); });
    return () => controller.abort();
  }, [ready, gameId, snapshotId, scope, regionKey]);

  const observation = source.key === sourceKey ? source.observation : undefined;
  const ancestors = source.key === sourceKey ? source.ancestors : undefined;
  const direct = useMemo(() => observation ? currentPerception(observation, scope, view.region, ancestors) : undefined,
    [observation, scope, view.region, ancestors]);
  const retained = view.key === regionKey ? view : undefined;
  return { region: retained?.region ?? direct, pending: !retained?.region,
    error: retained?.error ?? (source.key === sourceKey ? source.error : undefined) };
}

function yieldPreparation(signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, 50);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}
