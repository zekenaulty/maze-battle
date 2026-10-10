import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './screens/dialog.css';

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}

export function Dialog({ title, children, onClose, closeDisabled = false }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    // Native modality supplies focus containment and makes the underlying game inert.
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute('open', '');
    return () => {
      dialog?.close?.();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return createPortal(
      <dialog ref={ref} className="dialog screen-dialog" aria-modal="true" aria-labelledby={titleId}
        onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (!closeDisabled) onClose(); }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key !== 'Tab') return;
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
            .filter((element) => element.getClientRects().length > 0);
          const first = focusable[0];
          const last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" aria-label="Close dialog" title="Close dialog" disabled={closeDisabled} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </dialog>,
      document.body,
  );
}
