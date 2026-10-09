import { useEffect, useRef, useState } from 'react';
import type { DirectedCommand, DirectedRequest, DirectedSession, NavigationTarget } from '../domain/directed/operationTypes';
import type { PresentedContext } from '../domain/directed/types';
import { captureDirectedContext, claimDirectedSave, createDirectedSave, executeDirectedRequest,
  readDirectedSave, reconcileDirectedRequest } from '../persistence/directed';

export const DIRECTED_SLOT = 'known-destination-proof-v1';
const OWNER_KEY = 'maze-directed-controller-v1';
const PENDING_KEY = 'maze-directed-pending-v1';
function controller() {
  const existing = sessionStorage.getItem(OWNER_KEY);
  const id = existing ?? crypto.randomUUID();
  sessionStorage.setItem(OWNER_KEY, id);
  return id;
}

export function useDirectedPlay() {
  const owner = useRef<string>(controller());
  const [session, setSession] = useState<DirectedSession>();
  const [context, setContext] = useState<PresentedContext>();
  const [error, setError] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delay, setDelay] = useState(260);
  const queue = useRef(Promise.resolve());
  const alive = useRef(false);

  const refresh = async () => {
    const latest = await readDirectedSave(DIRECTED_SLOT);
    if (!latest) throw new Error('Directed save is unavailable.');
    const presented = await captureDirectedContext(DIRECTED_SLOT, `${owner.current}:view:${latest.knowledge.revision}`, 'human-view');
    if (alive.current) { setSession(latest); setContext(presented); }
    return latest;
  };
  const recover = async () => {
    const stored = sessionStorage.getItem(PENDING_KEY);
    if (!stored) return;
    const request: DirectedRequest = JSON.parse(stored);
    const original = await reconcileDirectedRequest(DIRECTED_SLOT, request);
    // Atomic IDB transactions make absence after this serialized read a no-effect result.
    if (!original) await executeDirectedRequest(DIRECTED_SLOT, request, Date.now());
    sessionStorage.removeItem(PENDING_KEY);
  };
  const enqueue = (work: () => Promise<void>) => {
    const next = queue.current.then(async () => {
      if (alive.current) setBusy(true);
      try { await work(); if (alive.current) setError(undefined); }
      catch (cause) { if (alive.current) { setError(String(cause)); setPlaying(false); } }
      finally { if (alive.current) setBusy(false); }
    });
    queue.current = next;
    return next;
  };
  const dispatch = (command: DirectedCommand) => enqueue(async () => {
    await recover();
    const current = await readDirectedSave(DIRECTED_SLOT);
    if (!current || current.owner !== owner.current) {
      await refresh();
      throw new Error('Another controller owns this save. Take control to continue.');
    }
    const request: DirectedRequest = { attemptId: crypto.randomUUID(), owner: owner.current,
      epoch: current.epoch, expectedRevision: current.revision, command };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(request));
    const receipt = await executeDirectedRequest(DIRECTED_SLOT, request, Date.now());
    sessionStorage.removeItem(PENDING_KEY);
    await refresh();
    if (receipt.result.status === 'refused') throw new Error(receipt.result.reason);
  });
  useEffect(() => {
    alive.current = true;
    void enqueue(async () => {
      const initial = await createDirectedSave(DIRECTED_SLOT);
      if (!initial.owner) await claimDirectedSave(DIRECTED_SLOT, owner.current);
      await recover(); await refresh();
    });
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!playing || busy || error || session?.operation?.status !== 'running') return;
    const operation = session.operation;
    const timer = setTimeout(() => void dispatch({ type: 'step', operationId: operation.id, sequence: operation.nextStep }), delay);
    return () => clearTimeout(timer);
  }, [playing, busy, error, session, delay]);

  const navigate = (target: NavigationTarget) => {
    setPlaying(true);
    void dispatch({ type: 'navigate', operationId: crypto.randomUUID(), target });
  };
  const cancel = () => {
    setPlaying(false);
    if (session?.operation?.status === 'running') void dispatch({ type: 'cancel', operationId: session.operation.id });
  };
  const takeControl = () => {
    setPlaying(false);
    void enqueue(async () => { await recover(); await claimDirectedSave(DIRECTED_SLOT, owner.current); await refresh(); });
  };
  const reconcile = () => enqueue(async () => { await recover(); await refresh(); });
  return { session, context, error, playing, busy, delay, setDelay, navigate, cancel, dispatch, takeControl, reconcile,
    pause: () => setPlaying(false), resume: () => setPlaying(true),
    controlled: session?.owner === owner.current };
}
