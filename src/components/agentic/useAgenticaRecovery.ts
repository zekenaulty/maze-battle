import { useEffect, useMemo, useRef, useState } from 'react';
import { inspectAgenticaRecovery, listAgenticaRecovery, type RecoveryCandidate } from '../../persistence/canonical/agentica/recovery';
import { readLaunch } from '../../persistence/canonical/agentica/launch';
import { createGrantedLaunchRecovery, createLaunchRecovery } from '../../services/agentica/game/launchRecovery';
import type { GameSession } from '../../services/game/GameSession';
import type { GameView } from '../../services/game/GameView';

export type RecoveryInventory = Awaited<ReturnType<typeof listAgenticaRecovery>>;
export type RecoveryInspection = Awaited<ReturnType<typeof inspectAgenticaRecovery>>;
interface State {
  key: object; inventory?: RecoveryInventory; detail?: RecoveryInspection;
  busy?: string; error?: string; service?: string; ended?: boolean;
}
interface Scope { key: object; abort: AbortController; busy: boolean; close?: () => void }
export interface RecoveryProps { controller: GameSession; game?: GameView; controlled: boolean }

export function useAgenticaRecovery({ controller, game, controlled }: RecoveryProps) {
  const hostSignal = controller.hostSignal;
  const key = useMemo(() => ({}), [controller, hostSignal, controller.owner, game?.id, game?.snapshot.generation, controlled]);
  const latest = useRef(key); latest.current = key;
  const scope = useRef<Scope | undefined>(undefined);
  const [state, setState] = useState<State>({ key });
  const alive = (s: Scope) => scope.current === s && latest.current === s.key && !s.abort.signal.aborted;
  function assertAlive(s: Scope) {
    if (!alive(s) || controller.hostSignal !== hostSignal) throw new Error('Recovery view changed.');
  }
  const patch = (s: Scope, value: Partial<State>) => {
    if (alive(s)) setState(previous => ({ ...(previous.key === s.key ? previous : { key: s.key }), ...value }));
  };
  async function run(s: Scope | undefined, label: string, work: (s: Scope) => Promise<void>) {
    if (!s || !alive(s) || s.busy) return;
    s.busy = true; patch(s, { busy: label, error: undefined });
    try { await work(s); }
    catch (error) { patch(s, { error: error instanceof Error ? error.message.slice(0, 240) : 'Recovery could not be read.' }); }
    finally { s.busy = false; patch(s, { busy: undefined }); }
  }
  async function load(s: Scope) {
    const inventory = await listAgenticaRecovery({ signal: s.abort.signal }); assertAlive(s);
    if (game && (inventory.fence.gameId !== game.id || inventory.fence.generation !== game.snapshot.generation))
      throw new Error('The local game changed. Reopen recovery from the current game.');
    patch(s, { inventory, detail: undefined });
  }
  useEffect(() => {
    const s: Scope = { key, abort: new AbortController(), busy: false }; scope.current = s;
    setState({ key });
    const end = () => {
      s.abort.abort(); s.close?.();
      if (scope.current === s && latest.current === key)
        setState({ key, ended: true, error: 'Game lifetime ended. Reopen recovery for current local records.' });
    };
    hostSignal.addEventListener('abort', end, { once: true });
    void run(s, 'Reading local records', load);
    return () => { hostSignal.removeEventListener('abort', end); s.abort.abort(); s.close?.(); };
  }, [key]);

  const view: State = state.key === key ? state : { key };
  const refresh = () => run(scope.current, 'Reading local records', async s => {
    patch(s, { inventory: undefined, detail: undefined, service: undefined }); await load(s);
  });
  const inspect = (candidate: RecoveryCandidate) => run(scope.current, 'Inspecting original', async s => {
    if (!view.inventory) return;
    patch(s, { detail: undefined });
    const detail = await inspectAgenticaRecovery(view.inventory.fence, candidate, { signal: s.abort.signal });
    assertAlive(s); patch(s, { detail });
  });
  const runService = (action: 'inspect' | 'stop') => run(scope.current, action === 'stop' ? 'Stopping root session' : 'Checking service', async s => {
    const inventory = view.inventory, active = inventory?.active;
    if (!active || !inventory) return;
    assertAlive(s); hostSignal.throwIfAborted(); patch(s, { service: undefined });
    // Read the current root, not an editable endpoint/run or a historical selected successor.
    const current = await readLaunch(); assertAlive(s);
    if (!current.value || current.value.binding.launchId !== active.launchId
      || (['generation', 'gameId', 'owner', 'epoch'] as const).some(field => current.head[field] !== inventory.fence[field]))
      throw new Error('Root binding or custody changed. Refresh local records.');
    const fetchBound: typeof fetch = (input, init) => {
      assertAlive(s); hostSignal.throwIfAborted();
      return fetch(input, { ...init, signal: AbortSignal.any([s.abort.signal, ...(init?.signal ? [init.signal] : [])]) });
    };
    const create = current.value.grant ? createGrantedLaunchRecovery : createLaunchRecovery;
    const recovery = await create(controller, active.launchId, fetchBound);
    try {
      s.close = recovery.close; assertAlive(s); hostSignal.throwIfAborted();
      const result = await recovery[action](); assertAlive(s);
      const message = result.status === 'settled' ? 'Root Stop acknowledged.'
        : result.status === 'stop-requested' ? 'Local Stop recorded; service Stop is pending.'
          : result.status === 'identified' ? result.settled ? 'Original root is settled at the service.' : 'Original root is retained, not settled.'
            : result.status === 'undispatched' ? 'Original root was not dispatched.'
              : action === 'stop' ? 'Local Stop recorded; original service start is unknown.' : 'Original service start is unknown; absence does not prove no execution.';
      patch(s, { service: message + ' Session clearance remains unknown.', detail: undefined });
      if (action === 'stop') await load(s);
    } finally { recovery.close(); s.close = undefined; }
  });
  return { ...view, refresh, inspect, runService, serviceAvailable: !hostSignal.aborted };
}
