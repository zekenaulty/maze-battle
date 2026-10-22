import { useEffect, useMemo, useRef, useState } from 'react';
import { inspectAgenticaRecovery, listAgenticaRecovery, type RecoveryCandidate } from '../../persistence/canonical/agentica/recovery';
import { readLaunch } from '../../persistence/canonical/agentica/launch';
import { inRecoveryDatabase } from '../../persistence/canonical/agentica/recovery.database';
import { createGrantedLaunchRecovery, createLaunchRecovery } from '../../services/agentica/game/launchRecovery';
import { recoverGameNavigation } from '../../services/agentica/game/navigationRecovery';
import { inspectPlayAdoption, type PlayAdoptionOffer } from '../../services/agentica/game/playAdoption';
import { inspectActiveNavigation, type ActiveNavigationOffer } from '../../services/agentica/game/playActiveNavigation';
import { navigationRecoveryStatus } from './navigationRecoveryStatus';
import { listGamePendingActions, inspectGamePendingAction, reconcileGamePendingAction, isPendingRecoveryInvalidated,
  type PendingActionPage, type PendingActionSelection } from '../../services/agentica/game/pendingActionRecovery';
import type { GameSession } from '../../services/game/GameSession';
import type { GameView } from '../../services/game/GameView';

export type RecoveryInventory = Awaited<ReturnType<typeof listAgenticaRecovery>>;
export type RecoveryInspection = Awaited<ReturnType<typeof inspectAgenticaRecovery>>;
interface State {
  key: object; inventory?: RecoveryInventory; detail?: RecoveryInspection;
  busy?: string; error?: string; service?: string; ended?: boolean;
  pendingPage?: PendingActionPage; pendingSelection?: PendingActionSelection;
  adoption?: { key: object; offer: PlayAdoptionOffer };
  navigation?: { key: object; offer: ActiveNavigationOffer };
}
interface Scope { key: object; abort: AbortController; busy: boolean; close?: () => void }
export interface RecoveryProps { controller: GameSession; game?: GameView; controlled: boolean; onAdopt?: (offer: PlayAdoptionOffer) => void;
  onResume?: (offer: ActiveNavigationOffer) => void }

export function useAgenticaRecovery({ controller, game, controlled, onAdopt, onResume }: RecoveryProps) {
  const hostSignal = controller.hostSignal;
  const key = useMemo(() => ({}), [controller, hostSignal, controller.owner, game?.id, game?.snapshot.generation, controlled]);
  const canOfferAdoption = () => Boolean((onAdopt || onResume) && controlled && game && controller.view?.controlled
    && !controller.view.busy && !controller.view.recoveryRequired && controller.view.game?.id === game.id
    && controller.view.game.snapshot.generation === game.snapshot.generation && controller.view.game.snapshot.revision === game.snapshot.revision
    && controller.view.game.mode === game.mode && controller.view.game.checkpoint.townReturnMode === game.checkpoint.townReturnMode
    && controller.view.game.mode !== 'town' && controller.view.game.mode !== 'auto-play' && controller.view.game.checkpoint.townReturnMode !== 'auto-play');
  const eligible = canOfferAdoption();
  const adoptionKey = useMemo(() => ({}), [key, eligible, game?.snapshot.revision, game?.mode, game?.checkpoint.townReturnMode]);
  const latestAdoption = useRef(adoptionKey); latestAdoption.current = adoptionKey;
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
    catch (error) {
      if (isPendingRecoveryInvalidated(error))
        patch(s, { inventory: undefined, detail: undefined, pendingPage: undefined, pendingSelection: undefined, service: undefined });
      patch(s, { adoption: undefined, navigation: undefined, error: error instanceof Error ? error.message.slice(0, 240) : 'Recovery could not be read.' });
    }
    finally { s.busy = false; patch(s, { busy: undefined }); }
  }
  async function load(s: Scope) {
    const inventory = await listAgenticaRecovery({ signal: s.abort.signal }); assertAlive(s);
    if (game && (inventory.fence.gameId !== game.id || inventory.fence.generation !== game.snapshot.generation))
      throw new Error('The local game changed. Reopen recovery from the current game.');
    patch(s, { inventory, detail: undefined, adoption: undefined, navigation: undefined, pendingPage: undefined, pendingSelection: undefined });
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
    if (hostSignal.aborted) end();
    else void run(s, 'Reading local records', load);
    return () => { hostSignal.removeEventListener('abort', end); s.abort.abort(); s.close?.(); };
  }, [key]);

  const view: State = state.key === key ? state : { key };
  const refresh = () => run(scope.current, 'Reading local records', async s => {
    patch(s, { inventory: undefined, detail: undefined, adoption: undefined, navigation: undefined, service: undefined, pendingPage: undefined, pendingSelection: undefined }); await load(s);
  });
  const inspect = (candidate: RecoveryCandidate) => run(scope.current, 'Inspecting original', async s => {
    if (!view.inventory) return;
    patch(s, { detail: undefined, adoption: undefined, navigation: undefined, service: undefined, pendingPage: undefined, pendingSelection: undefined });
    const detail = await inspectAgenticaRecovery(view.inventory.fence, candidate, { signal: s.abort.signal });
    assertAlive(s); patch(s, { detail });
    if (!canOfferAdoption() || latestAdoption.current !== adoptionKey) return;
    if (onResume && detail.operation.state === 'admitted' && detail.progress.status === 'running') {
      const offer = await inspectActiveNavigation(controller, detail.fence, detail.candidate, { signal: s.abort.signal });
      assertAlive(s);
      if (offer && canOfferAdoption() && latestAdoption.current === adoptionKey) patch(s, { navigation: { key: adoptionKey, offer } });
      return;
    }
    if (!onAdopt) return;
    const offer = await inspectPlayAdoption(controller, detail.fence, detail.candidate, { signal: s.abort.signal });
    assertAlive(s);
    if (offer && canOfferAdoption() && latestAdoption.current === adoptionKey) patch(s, { adoption: { key: adoptionKey, offer } });
  });
  const adoptionOffer = eligible && view.adoption?.key === adoptionKey ? view.adoption.offer : undefined;
  const navigationOffer = eligible && view.navigation?.key === adoptionKey ? view.navigation.offer : undefined;
  const resume = () => run(scope.current, 'Resuming navigation', async s => {
    if (!navigationOffer || !onResume || !canOfferAdoption() || latestAdoption.current !== adoptionKey) return;
    assertAlive(s); hostSignal.throwIfAborted(); patch(s, { navigation: undefined }); onResume(navigationOffer);
  });
  const adopt = () => run(scope.current, 'Adopting navigation', async s => {
    if (!adoptionOffer || !canOfferAdoption() || latestAdoption.current !== adoptionKey) return;
    assertAlive(s); hostSignal.throwIfAborted();
    patch(s, { adoption: undefined });
    onAdopt!(adoptionOffer);
  });
  const runNavigation = (action: 'stop' | 'reconcile') => run(scope.current,
    action === 'stop' ? 'Stopping navigation' : 'Reconciling navigation', async s => {
      const detail = view.detail;
      if (!detail) return;
      assertAlive(s); hostSignal.throwIfAborted(); patch(s, { service: undefined });
      const result = await recoverGameNavigation(controller, detail.fence, detail.candidate, action, { signal: s.abort.signal });
      assertAlive(s); hostSignal.throwIfAborted();
      patch(s, { service: navigationRecoveryStatus(result), detail: undefined, adoption: undefined, navigation: undefined });
      await load(s);
    });
  const runPending = (action: { kind: 'list'; afterActionId?: string } | { kind: 'inspect'; actionId: string } | { kind: 'reconcile' }) =>
    run(scope.current, action.kind === 'list' ? 'Checking action custody' : action.kind === 'inspect' ? 'Inspecting pending action' : 'Reconciling pending action', async s => {
      const detail = view.detail;
      if (!detail?.claim) return;
      assertAlive(s); patch(s, { service: undefined });
      const args = [controller, detail.fence, detail.candidate] as const, options = { signal: s.abort.signal };
      if (action.kind === 'list') {
        patch(s, { pendingPage: undefined, pendingSelection: undefined });
        const pendingPage = await listGamePendingActions(...args, { ...options, afterActionId: action.afterActionId });
        assertAlive(s); patch(s, { pendingPage });
      } else if (action.kind === 'inspect') {
        const item = view.pendingPage?.items.find(item => item.actionId === action.actionId);
        if (!item) throw new Error('Select an action from the current page.');
        patch(s, { pendingSelection: undefined });
        const pendingSelection = await inspectGamePendingAction(...args, item, options);
        assertAlive(s); patch(s, { pendingSelection });
      } else {
        if (!view.pendingSelection) throw new Error('Inspect the selected action first.');
        await reconcileGamePendingAction(...args, view.pendingSelection, options); assertAlive(s);
        patch(s, { service: 'Action reconciled as unavailable. Root and session clearance remain unknown.' });
        await load(s);
      }
    });
  const runService = (action: 'inspect' | 'stop') => run(scope.current, action === 'stop' ? 'Stopping root session' : 'Checking service', async s => {
    const inventory = view.inventory, active = inventory?.active;
    if (!active || !inventory) return;
    assertAlive(s); hostSignal.throwIfAborted(); patch(s, { service: undefined });
    // Hold the existing schema before any ordinary root/helper read can create or upgrade it.
    const result = await inRecoveryDatabase(AbortSignal.any([s.abort.signal, hostSignal]), async signal => {
      const check = () => { signal.throwIfAborted(); assertAlive(s); hostSignal.throwIfAborted(); };
      check();
      const current = await readLaunch(); check();
      if (!current.value || current.value.binding.launchId !== active.launchId
        || (['generation', 'gameId', 'owner', 'epoch'] as const).some(field => current.head[field] !== inventory.fence[field]))
        throw new Error('Root binding or custody changed. Refresh local records.');
      const fetchBound: typeof fetch = (input, init) => {
        check();
        return fetch(input, { ...init, signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) });
      };
      const create = current.value.grant ? createGrantedLaunchRecovery : createLaunchRecovery;
      const recovery = await create(controller, active.launchId, fetchBound);
      let closed = false;
      const close = () => { if (!closed) { closed = true; recovery.close(); } };
      try {
        s.close = close; signal.addEventListener('abort', close, { once: true }); check();
        const found = await recovery[action](); check();
        return found;
      } finally { signal.removeEventListener('abort', close); close(); s.close = undefined; }
    });
    assertAlive(s); hostSignal.throwIfAborted();
    const message = result.status === 'settled' ? 'Root Stop acknowledged.'
      : result.status === 'stop-requested' ? 'Local Stop recorded; service Stop is pending.'
        : result.status === 'identified' ? result.settled ? 'Original root is settled at the service.' : 'Original root is retained, not settled.'
          : result.status === 'undispatched' ? 'Original root was not dispatched.'
            : action === 'stop' ? 'Local Stop recorded; original service start is unknown.' : 'Original service start is unknown; absence does not prove no execution.';
    patch(s, { service: message + ' Session clearance remains unknown.', detail: undefined, adoption: undefined, navigation: undefined });
    if (action === 'stop') await load(s);
  });
  return { ...view, adoptionOffer, navigationOffer, adopt, resume, refresh, inspect, runNavigation, runPending, runService, serviceAvailable: !hostSignal.aborted };
}
