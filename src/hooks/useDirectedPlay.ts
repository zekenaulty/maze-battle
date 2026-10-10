import { useEffect, useRef, useState } from 'react';
import type { DirectedCommand, DirectedRequest, DirectedSession, NavigationTarget } from '../domain/directed/operationTypes';
import type { PresentedContext } from '../domain/directed/types';
import { isPerceptionProfile } from '../domain/directed/perceptionTypes';
import type { MemoryContextSelection } from '../domain/directed/contextSelection';
import { captureDirectedContext, claimDirectedSave, createDirectedSave, executeDirectedRequest,
  readDirectedSave, reconcileDirectedRequest, captureDirectedMemoryContext, captureDirectedSourceContext } from '../persistence/directed';

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
  const requestedProfile = new URLSearchParams(window.location.search).get('perception');
  const perceptionProfile = isPerceptionProfile(requestedProfile) ? requestedProfile : undefined;
  const slot = perceptionProfile ? `${DIRECTED_SLOT}-${perceptionProfile}` : DIRECTED_SLOT;
  const pendingKey = perceptionProfile ? `${PENDING_KEY}:${slot}` : PENDING_KEY;
  const owner = useRef<string>(controller());
  const [session, setSession] = useState<DirectedSession>();
  const [context, setContext] = useState<PresentedContext>();
  const [memoryContext, setMemoryContext] = useState<PresentedContext>();
  const [sourceContext, setSourceContext] = useState<PresentedContext>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delay, setDelay] = useState(260);
  const queue = useRef(Promise.resolve());
  const alive = useRef(false);
  const runAllowed = useRef(false);

  const refresh = async () => {
    const latest = await readDirectedSave(slot);
    if (!latest) throw new Error('Directed save is unavailable.');
    const presented = await captureDirectedContext(slot, `${owner.current}:view:${latest.knowledge.revision}`, 'human-view');
    if (alive.current) { setSession(latest); setContext(presented); }
    return latest;
  };
  const recover = async () => {
    const stored = sessionStorage.getItem(pendingKey);
    if (!stored) return;
    const request: DirectedRequest = JSON.parse(stored);
    const original = await reconcileDirectedRequest(slot, request);
    // Atomic IDB transactions make absence after this serialized read a no-effect result.
    if (!original) await executeDirectedRequest(slot, request, Date.now());
    sessionStorage.removeItem(pendingKey);
  };
  const enqueue = (work: () => Promise<void>) => {
    const next = queue.current.then(async () => {
      if (alive.current) setBusy(true);
      try { await work(); if (alive.current) setError(undefined); }
      catch (cause) { runAllowed.current = false; if (alive.current) { setError(String(cause)); setPlaying(false); } }
      finally { if (alive.current) setBusy(false); }
    });
    queue.current = next;
    return next;
  };
  const dispatch = (command: DirectedCommand) => enqueue(async () => {
    await recover();
    const current = await readDirectedSave(slot);
    if (!current || current.owner !== owner.current) {
      await refresh();
      throw new Error('Another controller owns this save. Take control to continue.');
    }
    const request: DirectedRequest = { attemptId: crypto.randomUUID(), owner: owner.current,
      epoch: current.epoch, expectedRevision: current.revision, command };
    sessionStorage.setItem(pendingKey, JSON.stringify(request));
    const receipt = await executeDirectedRequest(slot, request, Date.now());
    sessionStorage.removeItem(pendingKey);
    await refresh();
    if (alive.current) setMessage(receipt.result.reason);
    if (receipt.result.status === 'refused') throw new Error(receipt.result.reason);
  });
  useEffect(() => {
    alive.current = true;
    void enqueue(async () => {
      const initial = await createDirectedSave(slot, { perceptionProfile });
      if (!initial.owner) await claimDirectedSave(slot, owner.current);
      await recover(); await refresh();
    });
    return () => { alive.current = false; runAllowed.current = false; };
  }, []);
  useEffect(() => {
    if (!playing || busy || error || session?.operation?.status !== 'running') return;
    const operation = session.operation;
    const timer = setTimeout(() => {
      if (runAllowed.current) void dispatch({ type: 'step', operationId: operation.id, sequence: operation.nextStep });
    }, delay);
    return () => clearTimeout(timer);
  }, [playing, busy, error, session, delay]);

  const navigate = (target: NavigationTarget) => {
    runAllowed.current = true; setPlaying(true);
    void dispatch({ type: 'navigate', operationId: crypto.randomUUID(), target });
  };
  const cancel = () => {
    runAllowed.current = false; setPlaying(false);
    if (session?.operation?.status === 'running') void dispatch({ type: 'cancel', operationId: session.operation.id });
  };
  const takeControl = () => {
    runAllowed.current = false; setPlaying(false); setMessage(undefined);
    void enqueue(async () => { await recover(); await claimDirectedSave(slot, owner.current); await refresh(); });
  };
  const reconcile = () => enqueue(async () => { await recover(); await refresh(); });
  const loadMemory = (selection: MemoryContextSelection) => enqueue(async () => {
    const captured = await captureDirectedMemoryContext(slot, crypto.randomUUID(), 'human-view', selection);
    if (alive.current) { setMemoryContext(captured); setSourceContext(undefined); }
  });
  const loadSource = (sourceId: string) => enqueue(async () => {
    const captured = await captureDirectedSourceContext(slot, crypto.randomUUID(), 'human-view', [sourceId]);
    if (alive.current) setSourceContext(captured);
  });
  const pause = () => {
    runAllowed.current = false; setPlaying(false); setPausing(true);
    void enqueue(async () => { await refresh(); }).finally(() => { if (alive.current) setPausing(false); });
  };
  return { session, context, memoryContext, loadMemory, sourceContext, loadSource, error, message, playing, pausing, busy, delay, setDelay, navigate, cancel, dispatch, takeControl, reconcile,
    pause, resume: () => { runAllowed.current = true; setPlaying(true); },
    controlled: session?.owner === owner.current };
}
