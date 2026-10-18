import type { RecoveryInspection } from './useAgenticaRecovery';

export function RecoveryDetails({ detail }: { detail: RecoveryInspection }) {
  return <section aria-label="Original action inspection" className="agentica-recovery-section">
    <h3>Original navigation</h3>
    <dl className="agentica-recovery-facts">
      <dt>Action</dt><dd>{detail.action.actionId}</dd>
      <dt>Capability</dt><dd>{detail.action.capabilityId}</dd>
      <dt>Local operation</dt><dd>{detail.operation.state}</dd>
      <dt>Progress</dt><dd>{detail.progress.status}, {detail.progress.steps} steps</dd>
      <dt>Terminal</dt><dd>{detail.operation.terminal?.disposition ?? 'Not retained'}</dd>
      <dt>ACK receipt</dt><dd>{detail.acknowledgement ? 'Retained' : 'Not retained'}</dd>
      <dt>Decision</dt><dd>{detail.claim ? 'Claim retained' : detail.decision ? 'Intent retained' : 'Not retained'}</dd>
    </dl>
  </section>;
}
