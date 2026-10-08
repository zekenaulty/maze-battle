import { useEffect, useRef, type RefObject } from 'react';

export function useCharacterDialogFocus(root: RefObject<HTMLDivElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = root.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    (root.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? dialog.querySelector<HTMLElement>('button'))?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, summary, [tabindex="0"]')).filter((element) =>
        !element.closest('[hidden]') &&
        !element.matches(':disabled') &&
        element.tabIndex >= 0 &&
        !element.closest('details:not([open]) :not(summary)'),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('keydown', handleKey);
    return () => {
      dialog.removeEventListener('keydown', handleKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [root]);
}
