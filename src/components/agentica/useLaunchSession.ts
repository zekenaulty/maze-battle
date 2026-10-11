import { useEffect, useRef, useState } from 'react';
import { LaunchSession, type LaunchView } from '../../services/agentica/launch/session';
import { DEFAULT_LAUNCH } from '../../services/agentica/launch/configuration';

export function useLaunchSession() {
  const session = useRef<LaunchSession | null>(null);
  const [view, setView] = useState<LaunchView>({ status: 'loading', connection: 'disconnected', busy: false });
  const [config, setConfig] = useState(DEFAULT_LAUNCH);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    let active = true;
    const current = new LaunchSession(next => { if (active) setView(next); });
    session.current = current;
    void current.load().then(() => {
      if (active && current.view.journal) { setConfig(current.view.journal.config); setSelected(current.view.journal.selected); }
    });
    const close = () => { void current.close().catch(() => undefined); };
    window.addEventListener('pagehide', close);
    return () => { active = false; window.removeEventListener('pagehide', close); close(); };
  }, []);
  return { session, view, config, setConfig, selected, setSelected };
}
