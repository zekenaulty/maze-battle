import { useRef, useState } from 'react';
import { Download, Save, Trash2 } from 'lucide-react';
import type { SaveSummary } from '../domain/types';
import { MAX_MANUAL_SAVES } from '../persistence/canonical/game/saveLimits';
import { Dialog } from './Dialog';
import { ConfirmActionDialog } from './screens/ConfirmActionDialog';
import './screens/saves.css';

interface SavesDialogProps {
  saves: SaveSummary[];
  onClose: () => void;
  onCreateSave: () => void | Promise<void>;
  onLoadSave: (slotId: string) => void | Promise<void>;
  onDeleteSave: (slotId: string) => void | Promise<void>;
  onNewGame?: () => void | Promise<void>;
  readOnly?: boolean;
}

export function SavesDialog({ saves, onClose, onCreateSave, onLoadSave, onDeleteSave, onNewGame, readOnly = false }: SavesDialogProps) {
  const [confirmation, setConfirmation] = useState<{ action: 'load' | 'delete'; save: SaveSummary } | { action: 'new' }>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function createSave() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await onCreateSave(); setMessage('Manual save created.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create save.'); }
    finally { pending.current = false; setBusy(false); }
  }
  const sorted = [...saves].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const manualCount = saves.filter(save => save.kind === 'manual').length;
  const full = manualCount >= MAX_MANUAL_SAVES;
  return (
    <Dialog title="Saves" onClose={onClose} closeDisabled={busy}>
      <div className="screen-saves" aria-busy={busy}>
      <div className="dialog-actions">
        <button type="button" disabled={busy || readOnly || full} aria-describedby="manual-save-capacity" onClick={() => void createSave()}>
          <Save size={16} aria-hidden="true" /> {busy ? 'Saving...' : 'New save'}
        </button>
        {onNewGame && <button type="button" disabled={busy || readOnly} onClick={() => setConfirmation({ action: 'new' })}>New game</button>}
        <p id="manual-save-capacity">{manualCount} / {MAX_MANUAL_SAVES} manual saves{full ? '. Limit reached.' : ''}</p>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="save-list">
        {sorted.map((save) => (
          <article className="save-row" key={save.slotId}>
            <div>
              <strong>{save.label}</strong>
              <span>
                {save.kind} · level {save.dungeonLevel}
              </span>
              <time dateTime={save.updatedAt}>{formatSaveDate(save.updatedAt)}</time>
              <small>Warrior {save.partyLevels.warrior} - Mage {save.partyLevels.mage} - Healer {save.partyLevels.healer}</small>
            </div>
            <div className="save-row-actions">
              <button type="button" disabled={busy || readOnly} onClick={() => setConfirmation({ action: 'load', save })}>
                <Download size={16} aria-hidden="true" /> Load
              </button>
              <button type="button" disabled={busy || readOnly || save.kind === 'auto'} title={save.kind === 'auto' ? 'Start a new game to replace the active autosave' : undefined} onClick={() => setConfirmation({ action: 'delete', save })}>
                <Trash2 size={16} aria-hidden="true" /> Delete
              </button>
            </div>
          </article>
        ))}
        {saves.length === 0 ? <p className="empty-state">No saves</p> : null}
      </div>
      </div>
      {confirmation && <ConfirmActionDialog
        title={confirmation.action === 'new' ? 'Start a new game?' : `${confirmation.action === 'load' ? 'Load' : 'Delete'} save?`}
        message={confirmation.action === 'new' ? "This discards this game's current state, manual saves and observation history. This cannot be undone." : confirmation.action === 'load' ? `Load "${confirmation.save.label}"? This replaces the current expedition and autosave.` : `Delete "${confirmation.save.label}"? This cannot be undone.${confirmation.save.kind === 'auto' ? ' The active game continues and may create a new autosave.' : ''}`}
        confirmLabel={confirmation.action === 'new' ? 'Start new game' : confirmation.action === 'load' ? 'Load save' : 'Delete save'}
        onClose={() => setConfirmation(undefined)}
        onConfirm={async () => {
          if (confirmation.action === 'new') { await onNewGame?.(); onClose(); }
          else if (confirmation.action === 'load') await onLoadSave(confirmation.save.slotId);
          else { await onDeleteSave(confirmation.save.slotId); setMessage('Save deleted.'); }
        }}
      />}
    </Dialog>
  );
}

function formatSaveDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown save time' : date.toLocaleString();
}
