import { ArrowRight, Eye, RefreshCw, Server } from 'lucide-react';
import type { AgenticaAction } from '../../services/agentica/contracts';

interface Props {
  disabled: boolean;
  page?: { items: readonly { actionId: string; disposition: string | null }[]; nextAfterActionId: string | null };
  selected?: AgenticaAction;
  onList: (afterActionId?: string) => void;
  onInspect: (actionId: string) => void;
  onReconcile: () => void;
}

export function PendingActions({ disabled, page, selected, onList, onInspect, onReconcile }: Props) {
  return <section aria-label="Claimed run actions" className="agentica-recovery-section">
    <h3>Claimed run actions</h3>
    <div className="agentica-recovery-actions">
      <button type="button" disabled={disabled} onClick={() => onList()}>
        <Server size={16} aria-hidden="true" /> Check action custody</button>
      {page?.nextAfterActionId && <button type="button" disabled={disabled} onClick={() => onList(page.nextAfterActionId!)}>
        <ArrowRight size={16} aria-hidden="true" /> Next actions</button>}
    </div>
    {page && <>
      {!page.items.length && <p>No retained actions in this page. Session clearance remains unknown.</p>}
      <ul className="agentica-recovery-list">{page.items.map(item => <li key={item.actionId}>
        <span><strong>{item.actionId}</strong><small>{item.disposition ?? 'Unresolved'}</small></span>
        <button type="button" disabled={disabled} aria-label={`Inspect action ${item.actionId}`} onClick={() => onInspect(item.actionId)}>
          <Eye size={16} aria-hidden="true" /> Inspect action</button>
      </li>)}</ul>
    </>}
    {selected && <section aria-label="Selected pending action">
      <dl className="agentica-recovery-facts">
        <dt>Action</dt><dd>{selected.actionId}</dd>
        <dt>Capability</dt><dd>{selected.capabilityId}</dd>
        <dt>Original revision</dt><dd>{selected.expectedRevision}</dd>
      </dl>
      <div className="agentica-recovery-actions">
        <button type="button" disabled={disabled} onClick={onReconcile}>
          <RefreshCw size={16} aria-hidden="true" /> Reconcile pending action</button>
      </div>
    </section>}
  </section>;
}
