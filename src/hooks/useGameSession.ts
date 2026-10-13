import { useEffect, useState } from 'react';
import { GameSession, type GameSessionView } from '../services/game/GameSession';

export function useGameSession() {
  const [view, setView] = useState<GameSessionView>({ saves: [], diagnostics: [], status: 'Loading', controlled: false });
  const [session] = useState(() => new GameSession(setView));
  useEffect(() => {
    void session.start().catch(() => {});
    const refresh = () => { void session.refresh().catch(() => {}); };
    const timer = window.setInterval(refresh, 750);
    window.addEventListener('focus', refresh);
    const hide = () => session.stop();
    window.addEventListener('pagehide', hide);
    const show = (event: PageTransitionEvent) => { if (event.persisted) void session.start().catch(() => {}); };
    window.addEventListener('pageshow', show);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      session.stop();
    };
  }, [session]);
  return { ...view, controller: session,
    createManualSave: session.createManualSave, loadSave: session.loadSave, removeSave: session.removeSave,
    refreshSaves: session.refreshSaves, flush: session.flush, takeControl: session.takeControl,
    // Reload also retries a failed database-open promise without changing repository caching.
    retry: async () => { window.location.reload(); }, resetGame: session.resetGame };
}
