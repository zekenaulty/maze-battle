import { useCallback, useEffect, useRef, useState } from 'react';
import { createNewGameState } from '../domain/gameFactory';
import type { GameState, SaveSummary } from '../domain/types';
import { createPlayTelemetry, recordTransition } from '../domain/telemetry/transitions';
import type { PlayTelemetry, TransitionContext } from '../domain/telemetry/types';
import { importLegacyLocalStorageSaves } from '../persistence/legacyLocalStorage';
import { deleteSave, getGame, listSaves, saveGame } from '../persistence/saveRepository';
import { loadTelemetry, saveTelemetry } from '../persistence/telemetryRepository';

export function useGameSession() {
  const [game, setGame] = useState<GameState>();
  const [telemetry, setTelemetry] = useState<PlayTelemetry>();
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [status, setStatus] = useState('Loading');
  const current = useRef<GameState | undefined>(undefined);
  const log = useRef<PlayTelemetry | undefined>(undefined);
  const pending = useRef<GameState | undefined>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const lastWrittenSequence = useRef(-1);
  const telemetryWritable = useRef(true);

  const flush = useCallback(() => {
    const next = pending.current;
    const trace = telemetryWritable.current ? log.current : undefined;
    pending.current = undefined;
    if (!next && (!trace || trace.sequence === lastWrittenSequence.current)) return queue.current;
    if (trace) lastWrittenSequence.current = trace.sequence;
    queue.current = queue.current.catch(() => undefined).then(async () => {
      try {
        if (next) await saveGame('auto', 'Auto Save', 'auto', next);
        if (trace) await saveTelemetry(trace);
        setStatus(telemetryWritable.current ? 'Saved' : 'Saved; diagnostics storage unavailable');
      } catch (error) {
        if (next && !pending.current) pending.current = next;
        lastWrittenSequence.current = -1;
        setStatus(`Save failed: ${error instanceof Error ? error.message : 'storage unavailable'}`);
        throw error;
      }
    });
    return queue.current;
  }, []);

  const replaceGame = useCallback(async (next: GameState) => {
    await flush();
    let restored: PlayTelemetry | undefined;
    telemetryWritable.current = true;
    try { restored = await loadTelemetry(next.id); }
    catch { telemetryWritable.current = false; }
    current.current = next;
    pending.current = next;
    log.current = restored ?? createPlayTelemetry(next.id);
    lastWrittenSequence.current = -1;
    setGame(next);
    setTelemetry(log.current);
  }, [flush]);

  const transition = useCallback((update: (state: GameState) => GameState, context: TransitionContext) => {
    const before = current.current;
    if (!before) return;
    const started = performance.now();
    const next = update(before);
    log.current = recordTransition(log.current ?? createPlayTelemetry(before.id), before, next, {
      ...context, elapsedMs: performance.now() - started,
    });
    setTelemetry(log.current);
    if (next !== before) {
      current.current = next;
      pending.current = next;
      setGame(next);
    }
  }, []);

  const refreshSaves = useCallback(async () => { setSaves(await listSaves()); }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const imported = await importLegacyLocalStorageSaves();
        const saved = await getGame('auto');
        if (cancelled) return;
        await replaceGame(saved?.game ?? createNewGameState());
        if (cancelled) return;
        await refreshSaves();
        setStatus(!telemetryWritable.current ? 'Diagnostics storage unavailable; existing history protected' : imported ? `Imported ${imported} legacy saves` : 'Ready');
      } catch (error) {
        if (!cancelled) setStatus(`Load failed: ${error instanceof Error ? error.message : 'storage unavailable'}`);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshSaves, replaceGame]);

  useEffect(() => {
    const hide = () => { void flush().catch(() => undefined); };
    const id = window.setInterval(hide, 750);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', hide);
      hide();
    };
  }, [flush]);

  const createManualSave = useCallback(async () => {
    const next = current.current;
    if (!next) return;
    await flush();
    await saveGame(`manual-${crypto.randomUUID()}`, new Date().toLocaleString(), 'manual', next);
    await refreshSaves();
    setStatus('Manual save created');
  }, [flush, refreshSaves]);

  const loadSave = useCallback(async (id: string) => {
    await flush();
    const slot = await getGame(id);
    if (!slot) throw new Error('This save no longer exists.');
    await replaceGame(slot.game);
    setStatus(`Loaded ${slot.label}`);
  }, [flush, replaceGame]);

  const removeSave = useCallback(async (id: string) => {
    await flush();
    await deleteSave(id);
    await refreshSaves();
    setStatus('Save deleted');
  }, [flush, refreshSaves]);

  return { game, telemetry, status, saves, transition, replaceGame, createManualSave, loadSave, removeSave, refreshSaves, flush };
}
