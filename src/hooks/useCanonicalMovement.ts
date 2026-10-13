import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction, GridPosition } from '../domain/types';
import type { GameView } from '../services/game/GameView';
import { cellKey } from '../persistence/canonical/knowledge/keys';
import { readNavigationRoute, type KnownRoute } from '../persistence/canonical/knowledge/navigation';
import { disableManualAuto, manualScope, sameManualScope, type CanonicalController } from './canonicalManual';
import { ignoresGameKey } from './gameKeys';

export const CANONICAL_CLICK_STEP_MS = 160;
const WALK_LIMIT_MS = 15_000;
const directions: Record<string, Direction> = { w: 'north', arrowup: 'north', d: 'east', arrowright: 'east', s: 'south', arrowdown: 'south', a: 'west', arrowleft: 'west' };
const dialogOpen = () => Boolean(document.querySelector('dialog[open]'));
type Walk = { token: number; scope: ReturnType<typeof manualScope>; route: KnownRoute; index: number; revision: number; deadline: number };

export function useCanonicalMovement(game: GameView | undefined, blocked: boolean, controller: CanonicalController, pauseAuto?: () => void) {
  const [message, setMessage] = useState('');
  const latest = useRef({ game, blocked, controller, pauseAuto }); latest.current = { game, blocked, controller, pauseAuto };
  const token = useRef(0), walk = useRef<Walk | null>(null), reading = useRef<AbortController | null>(null), pending = useRef(false);
  const cancel = useCallback(() => { token.current++; walk.current = null; reading.current?.abort(); reading.current = null; setMessage(''); }, []);
  const available = useCallback((allowBusy = false) => {
    const { game, blocked, controller } = latest.current, view = controller.view;
    return !!game && !blocked && !dialogOpen() && view.controlled && !view.recoveryRequired && (allowBusy || !view.busy)
      && view.game?.id === game.id && view.game.snapshot.generation === game.snapshot.generation
      && view.game.checkpoint.position.level === game.checkpoint.position.level && view.game.mode !== 'town';
  }, []);

  const navigate = useCallback(async (target: GridPosition) => {
    const destination = { ...target };
    cancel();
    if (!available() || pending.current) return;
    latest.current.pauseAuto?.();
    const serial = token.current, scope = manualScope(controller), abort = new AbortController(); reading.current = abort;
    const current = () => serial === token.current && available() && sameManualScope(controller, scope);
    try {
      await disableManualAuto(controller, current);
      if (!current()) return;
      const game = controller.view.game!, revision = game.snapshot.revision;
      const origin = game.observation?.cells.find(cell => cellKey(cell.at) === cellKey(game.checkpoint.position));
      if (!origin) { setMessage('Observe the current position before navigating.'); return; }
      setMessage('Finding known route');
      const route = await readNavigationRoute(game.snapshot, origin.world, destination, abort.signal);
      if (!current() || controller.view.game!.snapshot.revision !== revision) {
        if (serial === token.current) cancel();
        return;
      }
      if (!route) { setMessage('No route in the bounded known area.'); return; }
      if (!route.steps.length) { setMessage('Arrived'); return; }
      walk.current = { token: serial, scope, route, index: 0, revision, deadline: Date.now() + WALK_LIMIT_MS };
      setMessage('Walking');
    } catch (error) {
      if (serial === token.current) { walk.current = null; setMessage(error instanceof Error ? error.message : 'Navigation failed.'); }
    } finally { if (reading.current === abort) reading.current = null; }
  }, [available, cancel, controller]);

  useEffect(() => {
    if (!game || blocked || !controller.view.controlled || controller.view.recoveryRequired || game.mode === 'town') cancel();
    return () => cancel();
  }, [game?.id, game?.snapshot.generation, game?.checkpoint.position.level, blocked, controller, controller.owner,
    controller.view.controlled, controller.view.recoveryRequired, game?.mode === 'town', cancel]);

  useEffect(() => {
    const observer = new MutationObserver(() => { if (dialogOpen()) cancel(); });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    const timer = window.setInterval(async () => {
      const active = walk.current;
      if (!active || pending.current) return;
      const live = controller.view.game, step = active.route.steps[active.index];
      if (!available() || !sameManualScope(controller, active.scope) || live?.mode !== 'manual'
        || live.snapshot.revision !== active.revision || Date.now() > active.deadline
        || cellKey(live.checkpoint.position) !== cellKey(step.from)) { cancel(); return; }
      pending.current = true;
      try {
        const receipt = await controller.execute('exploration', { kind: 'move', direction: step.direction, triggerStairs: false });
        if (walk.current !== active || active.token !== token.current) return;
        const next = controller.view.game;
        if (!available() || !sameManualScope(controller, active.scope) || receipt.beforeRevision !== active.revision
          || receipt.afterRevision !== next?.snapshot.revision || cellKey(next.checkpoint.position) !== cellKey(step.to)) { cancel(); return; }
        active.index++; active.revision = receipt.afterRevision;
        if (active.index === active.route.steps.length) {
          walk.current = null; setMessage(active.route.complete ? 'Arrived' : 'Route window complete. Select another destination.');
        }
      } catch (error) {
        if (walk.current === active) { walk.current = null; setMessage(error instanceof Error ? error.message : 'Movement failed.'); }
      } finally { pending.current = false; }
    }, CANONICAL_CLICK_STEP_MS);
    const keyboard = async (event: KeyboardEvent) => {
      if (ignoresGameKey(event) || !directions[event.key.toLowerCase()] || !available(true)) return;
      event.preventDefault(); cancel();
      latest.current.pauseAuto?.();
      if (pending.current || controller.view.busy) return;
      const serial = token.current;
      pending.current = true;
      try {
        await disableManualAuto(controller, () => serial === token.current && available());
        if (serial === token.current && available()) await controller.execute('exploration',
          { kind: 'move', direction: directions[event.key.toLowerCase()], triggerStairs: true });
      } catch (error) {
        if (serial === token.current) setMessage(error instanceof Error ? error.message : 'Movement failed.');
      } finally { pending.current = false; }
    };
    window.addEventListener('keydown', keyboard);
    return () => { observer.disconnect(); window.clearInterval(timer); window.removeEventListener('keydown', keyboard); cancel(); };
  }, [available, cancel, controller]);

  return { navigate, cancel, message };
}
