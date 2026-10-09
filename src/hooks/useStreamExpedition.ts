import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction } from '../domain/types';
import type { StreamCommand } from '../domain/expedition/streaming/types';
import type { StreamSnapshot } from '../persistence/streamRepository';
import { openStreamRuntime, type StreamRuntime } from '../services/expedition/streamRuntime';

export function useStreamExpedition() {
  const runtime = useRef<StreamRuntime | undefined>(undefined);
  const mounted = useRef(false);
  const intent = useRef(0);
  const automatic = useRef(false);
  const [view, setView] = useState<StreamSnapshot>();
  const [playing, setPlaying] = useState(false);
  const [delay, setDelay] = useState(160);
  const [message, setMessage] = useState('Loading streamed expedition.');
  const [error, setError] = useState<string>();
  const [facing, setFacing] = useState<Direction>('south');

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    void openStreamRuntime(() => cancelled, snapshot => { if (!cancelled) setView(snapshot); }).then(state => {
      if (cancelled || !state) return;
      runtime.current = state;
      setView(state.snapshot);
      setMessage(state.snapshot.checkpoint.phase === 'complete' ? 'Expedition complete.' : 'Checkpoint loaded.');
    }).catch(reason => { if (!cancelled) setError(String(reason)); });
    return () => {
      cancelled = true; mounted.current = false; automatic.current = false; intent.current++;
      void runtime.current?.takeOver().catch(() => undefined);
    };
  }, []);

  const stop = useCallback(() => {
    intent.current++; automatic.current = false; setPlaying(false);
    const state = runtime.current;
    void state?.takeOver().catch(reason => {
      if (!mounted.current || runtime.current !== state) return;
      // A failed claim faults this runtime, including a newer start intent.
      intent.current++; automatic.current = false; setPlaying(false);
      setError(String(reason));
    });
  }, []);

  const dispatch = useCallback(async (command?: StreamCommand, manual = false) => {
    if (manual) stop();
    const state = runtime.current;
    const generation = intent.current;
    if (!state || state.faulted) return;
    try {
      const result = command ? await state.dispatch(command) : await state.automatic();
      if (!mounted.current || runtime.current !== state || generation !== intent.current || !result) return;
      setMessage(result.reason);
      if (result.disposition === 'applied') setFacing(state.lastDirection);
      if (result.disposition !== 'applied' || state.snapshot.checkpoint.phase === 'complete') stop();
      if (state.faulted) setError(`${result.reason} Reload to reconcile control.`);
    } catch (reason) {
      if (mounted.current && runtime.current === state && generation === intent.current) {
        stop(); setError(`${String(reason)} Reload to reconcile the checkpoint.`);
      }
    }
  }, [stop]);

  useEffect(() => {
    if (!playing || !view || error || view.checkpoint.phase === 'complete') return;
    const timer = window.setTimeout(() => { if (automatic.current) void dispatch(); }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, view, error, delay, dispatch]);

  const toggle = () => {
    if (automatic.current) { stop(); return; }
    if (error || view?.checkpoint.phase === 'complete') return;
    automatic.current = true; setPlaying(true);
  };
  return { view, runtime: runtime.current, playing, delay, setDelay, message, error, facing, dispatch, stop, toggle };
}
