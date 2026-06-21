import type { SaveSummary } from '../domain/types';
import { Dialog } from './Dialog';

interface SavesDialogProps {
  saves: SaveSummary[];
  onClose: () => void;
  onCreateSave: () => void;
  onLoadSave: (slotId: string) => void;
  onDeleteSave: (slotId: string) => void;
}

export function SavesDialog({ saves, onClose, onCreateSave, onLoadSave, onDeleteSave }: SavesDialogProps) {
  return (
    <Dialog title="Saves" onClose={onClose}>
      <div className="dialog-actions">
        <button type="button" onClick={onCreateSave}>
          New save
        </button>
      </div>
      <div className="save-list">
        {saves.map((save) => (
          <article className="save-row" key={save.slotId}>
            <div>
              <strong>{save.label}</strong>
              <span>
                {save.kind} · level {save.dungeonLevel}
              </span>
            </div>
            <div className="save-row-actions">
              <button type="button" onClick={() => onLoadSave(save.slotId)}>
                Load
              </button>
              <button type="button" onClick={() => onDeleteSave(save.slotId)}>
                Delete
              </button>
            </div>
          </article>
        ))}
        {saves.length === 0 ? <p className="empty-state">No saves</p> : null}
      </div>
    </Dialog>
  );
}
