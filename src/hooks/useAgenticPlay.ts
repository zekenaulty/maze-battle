import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RpgAgenticaClient, type RpgAgenticaView } from '../services/agentica/rpg/client';
import type { GameSession } from '../services/game/GameSession';
import type { RpgAddress } from '../domain/agentic/knowledge/types';

const idle: RpgAgenticaView = { state: 'idle', connected: false, steps: 0, replans: 0 };
const terminal = new Set(['completed', 'cancelled', 'blocked']);
const inactive = (state: string) => terminal.has(state) || ['idle', 'paused', 'awaiting-adoption', 'disconnected'].includes(state);
const ordinaryDialogOpen = () => [...document.querySelectorAll('dialog[open]')]
  .some(dialog => !dialog.querySelector('[data-agentic-play]'));

export function useAgenticPlay(session: GameSession, suspended: boolean) {
  const [view, setView] = useState(idle);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string>();
  const [hasClient, setHasClient] = useState(false);
  const client = useRef<RpgAgenticaClient | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const pending = useRef(false);
  const cancelling = useRef(false);
  const ticking = useRef(false);
  const mounted = useRef(true);
  const blocked = useRef(suspended);
  blocked.current = suspended;

  const pause = useCallback(() => {
    generation.current++;
    clearTimeout(timer.current);
    client.current?.pause();
  }, []);

  useLayoutEffect(() => { if (suspended) pause(); }, [suspended, pause]);
  useEffect(() => {
    mounted.current = true;
    window.addEventListener('pagehide', pause);
    return () => {
      mounted.current = false;
      generation.current++;
      clearTimeout(timer.current);
      window.removeEventListener('pagehide', pause);
      client.current?.close();
      client.current = undefined;
    };
  }, [session, pause]);

  const schedule = useCallback((active: RpgAgenticaClient, epoch: number) => {
    const tick = async () => {
      if (!mounted.current || generation.current !== epoch || client.current !== active) return;
      if (blocked.current || !session.view.controlled || ordinaryDialogOpen()) { pause(); return; }
      if (ticking.current) { timer.current = setTimeout(tick, 150); return; }
      ticking.current = true;
      try { await active.tick(); }
      catch (reason) {
        if (mounted.current && client.current === active && generation.current === epoch) {
          pause(); setError(String(reason instanceof Error ? reason.message : reason));
        }
        return;
      } finally { ticking.current = false; }
      if (mounted.current && generation.current === epoch && client.current === active && !inactive(active.view.state)) {
        timer.current = setTimeout(tick, 150);
      }
    };
    timer.current = setTimeout(tick, 150);
  }, [session, pause]);

  const invoke = useCallback(async (action: 'start' | 'recover' | 'adopt', url?: string, target?: RpgAddress) => {
    if (pending.current || cancelling.current || blocked.current || !session.view.controlled) return;
    pause();
    const epoch = generation.current;
    pending.current = true;
    setBusy(true); setError(undefined);
    let active = client.current;
    try {
      if (action !== 'adopt') {
        if (!target || !url) throw new Error('An endpoint and target are required.');
        active?.close();
        let next: RpgAgenticaClient;
        next = new RpgAgenticaClient({ session, url, target,
          onChange: value => { if (mounted.current && client.current === next) setView(value); } });
        client.current = active = next;
        setView(next.view); setHasClient(true);
      }
      if (!active) throw new Error('Reconnect before adopting a retained run.');
      await session.flush();
      if (!mounted.current || generation.current !== epoch || blocked.current || !session.view.controlled) return;
      await active[action]();
      if (mounted.current && client.current === active) {
        setView(active.view);
        if (generation.current !== epoch || blocked.current || !session.view.controlled || ordinaryDialogOpen()) active.pause();
        else if (action !== 'recover') schedule(active, epoch);
      }
    } catch (reason) {
      if (mounted.current && generation.current === epoch) {
        active?.pause(); setError(String(reason instanceof Error ? reason.message : reason));
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [session, pause, schedule]);

  const stop = useCallback(async () => {
    pause();
    const active = client.current;
    if (!active || cancelling.current) return;
    cancelling.current = true;
    setStopping(true); setError(undefined);
    try { await active.cancel(); }
    catch (reason) { if (mounted.current && client.current === active) setError(String(reason instanceof Error ? reason.message : reason)); }
    finally { cancelling.current = false; if (mounted.current) setStopping(false); }
  }, [pause]);

  return { view, busy: busy || stopping, error, canStop: hasClient && (busy || stopping || !terminal.has(view.state)), pause, stop,
    start: (url: string, target: RpgAddress) => invoke('start', url, target),
    reconnect: (url: string, target: RpgAddress) => invoke('recover', url, target),
    adopt: () => invoke('adopt') };
}
