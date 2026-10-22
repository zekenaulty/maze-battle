import { Play, RefreshCw, Square, StepForward } from 'lucide-react';
import type { RecoveryInspection } from './useAgenticaRecovery';
import type { PlayAdoptionOffer } from '../../services/agentica/game/playAdoption';
import type { ActiveNavigationOffer } from '../../services/agentica/game/playActiveNavigation';

export function RecoveryDetails({ detail, disabled, adoptionOffer, navigationOffer, onResume, onAdopt, onRecover }: { detail: RecoveryInspection; disabled: boolean;
  adoptionOffer?: PlayAdoptionOffer; onAdopt?: () => void;
  navigationOffer?: ActiveNavigationOffer; onResume?: () => void;
  onRecover: (action: 'stop' | 'reconcile') => void }) {
  const label = detail.action.capabilityId === 'maze.interact' ? 'interaction' : 'navigation';
  return <section aria-label="Original action inspection" className="agentica-recovery-section">
    <h3>Original {label}</h3>
    <dl className="agentica-recovery-facts">
      <dt>Action</dt><dd>{detail.action.actionId}</dd>
      <dt>Capability</dt><dd>{detail.action.capabilityId}</dd>
      <dt>Local operation</dt><dd>{detail.operation.state}</dd>
      <dt>Progress</dt><dd>{detail.progress.status}{'steps' in detail.progress ? `, ${detail.progress.steps} steps` : ''}</dd>
      <dt>Terminal</dt><dd>{detail.operation.terminal?.disposition ?? 'Not retained'}</dd>
      <dt>ACK receipt</dt><dd>{detail.acknowledgement ? 'Retained' : 'Not retained'}</dd>
      <dt>Decision</dt><dd>{detail.claim ? 'Claim retained' : detail.decision ? 'Intent retained' : 'Not retained'}</dd>
    </dl>
    <div className="agentica-recovery-actions">
      <button type="button" disabled={disabled} onClick={() => onRecover('stop')}>
        <Square size={16} aria-hidden="true" /> Stop {label}</button>
      <button type="button" disabled={disabled} onClick={() => onRecover('reconcile')}>
        <RefreshCw size={16} aria-hidden="true" /> Reconcile {label}</button>
    </div>
    {navigationOffer && <div className="agentica-recovery-actions">
      <button type="button" disabled={disabled || !onResume} onClick={() => { if (!disabled) onResume?.(); }}>
        <Play size={16} aria-hidden="true" /> Resume navigation</button>
    </div>}
    {adoptionOffer && <>
      <h3>Retained Agentic play</h3>
      <dl className="agentica-recovery-facts">
        <dt>Objective</dt><dd>{adoptionOffer.objective}</dd>
        <dt>Endpoint</dt><dd>{adoptionOffer.profile.endpoint}</dd>
        <dt>Provider</dt><dd>{adoptionOffer.profile.provider.provider}</dd>
        <dt>Model</dt><dd>{adoptionOffer.profile.provider.model ?? 'Not specified'}</dd>
        <dt>Step limits</dt><dd>{adoptionOffer.profile.limits.maxSteps} steps / {adoptionOffer.profile.limits.maxRefinements} refinements
          / {adoptionOffer.profile.limits.maxPlanContinuations} continuations</dd>
        <dt>Timeouts</dt><dd>{adoptionOffer.profile.limits.timeoutSeconds} s run / {adoptionOffer.profile.limits.actionTimeoutSeconds} s action</dd>
        <dt>Tokens</dt><dd>{adoptionOffer.profile.provider.contextWindowTokens} context / {adoptionOffer.profile.provider.maxOutputTokens} output</dd>
        <dt>Remaining continuations</dt><dd>{adoptionOffer.remainingContinuations}</dd>
      </dl>
      <div className="agentica-recovery-actions">
        <button type="button" disabled={disabled || !onAdopt} onClick={() => { if (!disabled) onAdopt?.(); }}>
          <StepForward size={16} aria-hidden="true" /> Adopt and continue</button>
      </div>
    </>}
  </section>;
}
