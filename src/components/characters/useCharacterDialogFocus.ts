import { useEffect, type RefObject } from 'react';

export function useCharacterDialogFocus(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let cancelled = false;
    // Let Dialog capture the opener and showModal before choosing sheet autofocus.
    // Dialog alone owns containment, cancellation and restoration.
    queueMicrotask(() => {
      const content = root.current;
      const dialog = content?.closest<HTMLDialogElement>('dialog');
      if (cancelled || !content?.isConnected || !dialog?.open) return;
      (content.querySelector<HTMLElement>('.character-selector [aria-pressed="true"]') ?? dialog.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
    });
    return () => { cancelled = true; };
  }, [root]);
}
