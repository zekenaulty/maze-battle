import { useRef, useState } from 'react';
import { Dialog } from '../Dialog';

interface ConfirmActionDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmActionDialog({ title, message, confirmLabel, onConfirm, onClose }: ConfirmActionDialogProps) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action failed. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog title={title} onClose={onClose} closeDisabled={busy}>
      <div className="screen-confirm" aria-busy={busy}>
        <p>{message}</p>
        {error && <p role="alert">{error}</p>}
        <div className="screen-confirm-actions">
          <button type="button" autoFocus disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? 'Working...' : confirmLabel}</button>
        </div>
      </div>
    </Dialog>
  );
}
