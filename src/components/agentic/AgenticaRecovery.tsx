import { Eye, RefreshCw, Server, Square } from 'lucide-react';
import { Dialog } from '../Dialog';
import { RecoveryDetails } from './RecoveryDetails';
import { PendingActions } from './PendingActions';
import { useAgenticaRecovery, type RecoveryProps } from './useAgenticaRecovery';
import './recovery.css';

export function AgenticaRecovery(props: RecoveryProps & { onClose: () => void }) {
  const recovery = useAgenticaRecovery(props), inventory = recovery.inventory;
  const candidates = inventory?.allocations.flatMap(row => row.navigation ? [row.navigation] : []) ?? [];
  const predecessor = inventory?.selected?.predecessor;
  if (predecessor && !candidates.some(row => row.operationId === predecessor.operationId)) candidates.push(predecessor);
  const claimed = inventory?.claimed;
  if (claimed && !candidates.some(row => row.operationId === claimed.operationId)) candidates.push(claimed);
  const disabled = Boolean(recovery.busy || recovery.ended || !recovery.serviceAvailable);
  return <Dialog title="Agentica recovery" onClose={props.onClose}>
    <div className="agentica-recovery">
      <div className="agentica-recovery-heading"><h3>Local records</h3>
        <button type="button" aria-label="Refresh local records" title="Refresh local records" disabled={disabled}
          onClick={() => { void recovery.refresh(); }}><RefreshCw size={18} aria-hidden="true" /></button>
      </div>
      <dl className="agentica-recovery-facts">
        <dt>Remote actions</dt><dd>Unknown</dd>
        <dt>Session clearance</dt><dd>Unknown</dd>
        <dt>Agentic launch</dt><dd>Unavailable</dd>
      </dl>
      {recovery.busy && <p role="status">{recovery.busy}...</p>}
      {recovery.error && <p role="alert">{recovery.error}</p>}
      {recovery.service && <p role="status">{recovery.service}</p>}
      {inventory && <>
        <p className="agentica-recovery-revision">Local revision {inventory.fence.revision}</p>
        {inventory.active ? <section aria-label="Root session" className="agentica-recovery-section">
          <h3>Root session</h3>
          <dl className="agentica-recovery-facts">
            <dt>Launch</dt><dd>{inventory.active.launchId}</dd>
            <dt>Local state</dt><dd>{inventory.active.state}</dd>
            <dt>Grant</dt><dd>{inventory.active.grant ? 'Retained' : 'Not retained'}</dd>
          </dl>
          <div className="agentica-recovery-actions">
            <button type="button" disabled={disabled || !recovery.serviceAvailable} onClick={() => { void recovery.runService('inspect'); }}>
              <Server size={16} aria-hidden="true" /> Check service</button>
            <button type="button" disabled={disabled || !recovery.serviceAvailable} onClick={() => { void recovery.runService('stop'); }}>
              <Square size={16} aria-hidden="true" /> Stop Agentic session</button>
          </div>
        </section> : <p>No local root session found.</p>}
        <section aria-label="Local allocations" className="agentica-recovery-section">
          <h3>Local allocations ({inventory.allocations.length})</h3>
          {!inventory.allocations.length && !predecessor && !claimed && <p>No local recovery entries found.</p>}
          <ul className="agentica-recovery-list">{inventory.allocations.map(row => <li key={row.operationId}>
            <span><strong>{row.navigation ? 'Navigation' : row.operationId === inventory.active?.guardId ? 'Root session' : 'Other local work'}</strong>
              <small>{row.operationId}</small></span><span>{row.state}</span>
          </li>)}</ul>
        </section>
        {candidates.length > 0 && <section aria-label="Retained originals" className="agentica-recovery-section">
          <h3>Retained originals</h3>
          <ul className="agentica-recovery-list">{candidates.map((candidate, index) => <li key={candidate.operationId}>
            <span><strong>Navigation {index + 1}</strong><small>{candidate.operationId === predecessor?.operationId ? 'Selected predecessor'
              : candidate.operationId === claimed?.operationId ? 'Claimed parent' : 'Local allocation'}</small></span>
            <button type="button" disabled={disabled} onClick={() => { void recovery.inspect(candidate); }}>
              <Eye size={16} aria-hidden="true" /> Inspect original {index + 1}</button>
          </li>)}</ul>
        </section>}
      </>}
      {recovery.detail && <RecoveryDetails detail={recovery.detail} disabled={disabled}
        onRecover={action => { void recovery.runNavigation(action); }} />}
      {recovery.detail?.claim && <PendingActions disabled={disabled} page={recovery.pendingPage} selected={recovery.pendingSelection?.action}
        onList={afterActionId => { void recovery.runPending({ kind: 'list', afterActionId }); }}
        onInspect={actionId => { void recovery.runPending({ kind: 'inspect', actionId }); }}
        onReconcile={() => { void recovery.runPending({ kind: 'reconcile' }); }} />}
    </div>
  </Dialog>;
}
