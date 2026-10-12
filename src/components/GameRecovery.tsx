import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { ConfirmActionDialog } from './screens/ConfirmActionDialog';

interface GameRecoveryProps {
  status: string;
  busy?: boolean;
  onRetry: () => Promise<unknown>;
  onReset: () => Promise<unknown>;
}

export function GameRecovery({ status, busy, onRetry, onReset }: GameRecoveryProps) {
  const [confirming, setConfirming] = useState(false);
  return <main className="loading-screen" aria-busy={Boolean(busy)}>
    <section aria-label="Game recovery" style={{ maxWidth: '36rem', padding: 16, overflowWrap: 'anywhere' }}>
    <p role="status">{status}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" disabled={busy} onClick={() => { void onRetry().catch(() => {}); }}>
        <RotateCcw size={16} aria-hidden="true" /> Retry
      </button>
      <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
        <Trash2 size={16} aria-hidden="true" /> Reset and start new game
      </button>
    </div>
    </section>
    {confirming && <ConfirmActionDialog
      title="Reset Maze Battle?"
      message="This discards this game's saves and observation history and takes control from other tabs. Separate expedition data is not cleared. This cannot be undone."
      confirmLabel="Discard saves and start new game"
      onConfirm={async () => { await onReset(); }}
      onClose={() => setConfirming(false)}
    />}
  </main>;
}
