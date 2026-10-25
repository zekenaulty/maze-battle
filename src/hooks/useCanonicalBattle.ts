import { useCallback, useEffect, useRef, useState } from 'react';
import { CanonicalBattleController, type CanonicalBattleSession } from '../services/game/CanonicalBattleController';

export function useCanonicalBattle(session: CanonicalBattleSession, blocked: boolean) {
  const [message, setMessage] = useState('');
  const runner = useRef<CanonicalBattleController | null>(null);
  const latestBlocked = useRef(blocked); latestBlocked.current = blocked;
  const cancel = useCallback(() => runner.current?.cancel(), []);
  const update = useCallback(() => runner.current?.update(latestBlocked.current || Boolean(document.querySelector('dialog[open]'))), []);
  useEffect(() => {
    const controller = new CanonicalBattleController(session, setMessage); runner.current = controller;
    return () => { controller.dispose(); if (runner.current === controller) runner.current = null; };
  }, [session]);
  useEffect(update, [session, session.view.game, session.view.controlled,
    session.view.busy, session.view.recoveryRequired, session.owner, blocked, update]);
  useEffect(() => {
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, [update]);
  return { cancel, message };
}
