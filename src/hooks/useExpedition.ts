import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpeditionCommand } from '../domain/expedition/types';
import { ExpeditionRuntime, type ExpeditionView } from '../services/expedition/runtime';
import { restoreExpedition } from '../services/expedition/restore';
import type { Direction } from '../domain/types';

export { RESIDENT_CELL_BUDGET } from '../services/expedition/runtime';

export function useExpedition() {
  const runtime = useRef<ExpeditionRuntime | undefined>(undefined);
  const mounted = useRef(false);
  const auto = useRef(false);
  const [view, setView] = useState<ExpeditionView>();
  const [playing, setPlaying] = useState(false);
  const [delay, setDelay] = useState(160);
  const [message, setMessage] = useState('Loading expedition');
  const [error, setError] = useState<string>();
  const [facing, setFacing] = useState<Direction>('south');

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    void restoreExpedition(() => cancelled).then(saved => {
      if (cancelled || !saved) return;
      const state = new ExpeditionRuntime(saved, next => {
        if (mounted.current && runtime.current === state) setView(next);
      });
      runtime.current = state;
      setView(saved);
      setMessage(saved.checkpoint.phase === 'complete' ? 'Expedition complete.' : 'Checkpoint loaded.');
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load expedition.'); });
    return () => { cancelled = true; mounted.current = false; auto.current = false; void runtime.current?.takeOver().catch(() => undefined); };
  }, []);

  const stop = useCallback(() => {
    auto.current = false;
    setPlaying(false);
    void runtime.current?.takeOver().catch(reason => {
      if (mounted.current) setError(`${String(reason)} Reload to reconcile control.`);
    });
  }, []);
  const dispatch = useCallback(async (command: ExpeditionCommand, manual = false) => {
    if (manual) stop();
    const state = runtime.current;
    if (!state || state.faulted) return;
    const result = await state.dispatch(command).catch(reason => ({ disposition: 'unresolved', reason: String(reason) }));
    if (!mounted.current) return;
    setMessage(result.reason);
    if (result.disposition === 'applied' && command.type === 'move') setFacing(command.direction);
    if (result.disposition !== 'applied' || state.checkpoint.phase === 'complete') stop();
    if (['unresolved', 'conflict'].includes(result.disposition)) {
      state.faulted = true;
      setError(`${result.reason} Reload to reconcile the saved checkpoint.`);
    }
  }, [stop]);

  useEffect(() => {
    if (!playing || !view || view.checkpoint.phase === 'complete' || error) return;
    const timeout = window.setTimeout(() => {
      const state = runtime.current;
      if (!state || !auto.current) return;
      const decision = state.decide();
      setMessage(decision.reason);
      if (decision.command) void dispatch(decision.command);
      else stop();
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [playing, view, delay, error, dispatch, stop]);

  const toggle = () => {
    if (auto.current) { stop(); return; }
    if (error || view?.checkpoint.phase === 'complete') return;
    auto.current = true;
    setPlaying(true);
  };
  return { view, runtime: runtime.current, playing, delay, setDelay, toggle, stop, dispatch, message, error, facing };
}
