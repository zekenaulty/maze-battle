import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameView } from '../services/game/GameView';
import { CanonicalAutoController, type CanonicalAutoSession } from '../services/game/CanonicalAutoController';

/** React lifecycle for the disposable Auto scheduler; durable policy state lives in canonical storage. */
export function useCanonicalAuto(game: GameView | undefined, blocked: boolean, controller: CanonicalAutoSession) {
  const [message, setMessage] = useState(''), runner = useRef<CanonicalAutoController | null>(null);
  const cancel = useCallback(() => runner.current?.cancel(), []);
  useEffect(() => {
    const current = new CanonicalAutoController(controller, setMessage); runner.current = current;
    return () => { current.dispose(); if (runner.current === current) runner.current = null; };
  }, [controller]);
  useEffect(() => { runner.current?.update(blocked || Boolean(document.querySelector('dialog[open]'))); }, [game, blocked, controller, controller.view.controlled,
    controller.view.busy, controller.view.recoveryRequired, controller.owner]);
  useEffect(() => {
    const observer = new MutationObserver(() => { if (document.querySelector('dialog[open]')) cancel(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, [cancel]);
  return { cancel, message };
}
