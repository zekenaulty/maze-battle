import { useEffect } from 'react';
import { ignoresGameKey } from './gameKeys';

export function useExploreKeys(disabled: boolean, actions: { interact: () => void; map: () => void; inventory: () => void; portal: () => void; stop: () => void }) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (disabled || event.repeat || ignoresGameKey(event) || document.querySelector('dialog[open]')) return;
      const action = ({ e: actions.interact, m: actions.map, i: actions.inventory, t: actions.portal, escape: actions.stop })[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [disabled, actions]);
}
