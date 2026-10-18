import { useId, useState } from 'react';
import { Play, RefreshCw, Square } from 'lucide-react';
import { Dialog } from '../Dialog';
import type { GameLaunchOptions } from '../../services/agentica/game/launch';
import './agentic.css';

export interface AgenticPlayDialogProps {
  profile?: Omit<GameLaunchOptions, 'objectiveId' | 'objective'>;
  configurationError?: string;
  phase: string;
  message?: string;
  error?: string;
  active: boolean;
  canStart: boolean;
  onStart: (objective: string) => void;
  onStop: () => void;
  onRecovery: () => void;
  onClose: () => void;
}

export function AgenticPlayDialog({ profile, configurationError, phase, message, error, active, canStart,
  onStart, onStop, onRecovery, onClose }: AgenticPlayDialogProps) {
  const objectiveId = useId(), [objective, setObjective] = useState('');
  const trimmed = objective.trim(), { provider, limits } = profile ?? {};
  const startEnabled = Boolean(profile && !configurationError && canStart && !active && trimmed && objective.length <= 512);
  const missing = 'Not configured';
  return <Dialog title="Agentic play" onClose={onClose}>
    <div className="agentic-play agentic-play-controls">
      <div className="agentic-heading"><strong role="status">{phase}</strong>
        <span>{!profile ? missing : configurationError ? 'Unavailable' : 'Configured'}</span></div>
      {configurationError && <p className="agentic-error" role="alert">{configurationError}</p>}
      <label htmlFor={objectiveId}>Objective
        <textarea id={objectiveId} name="objective" rows={3} maxLength={512} value={objective} disabled={active}
          onChange={event => setObjective(event.target.value)} />
      </label>
      <dl className="agentic-status">
        <div><dt>Endpoint</dt><dd>{profile?.endpoint ?? missing}</dd></div>
        <div><dt>Provider</dt><dd>{provider?.provider ?? missing}</dd></div>
        <div><dt>Model</dt><dd>{provider?.model ?? (profile ? 'Not specified' : missing)}</dd></div>
        <div><dt>Step limits</dt><dd>{limits
          ? `${limits.maxSteps} steps / ${limits.maxRefinements} refinements / ${limits.maxPlanContinuations} continuations` : missing}</dd></div>
        <div><dt>Timeouts</dt><dd>{limits
          ? `${limits.timeoutSeconds} s run / ${limits.actionTimeoutSeconds} s action` : missing}</dd></div>
        <div><dt>Tokens</dt><dd>{provider
          ? `${provider.contextWindowTokens} context / ${provider.maxOutputTokens} output` : missing}</dd></div>
      </dl>
      {message && <p className="agentic-detail" role="status">{message}</p>}
      {error && <p className="agentic-error" role="alert">{error}</p>}
      <div className="agentic-actions">
        <button type="button" disabled={!startEnabled} onClick={() => { if (startEnabled) onStart(trimmed); }}>
          <Play size={16} aria-hidden="true" /> Start Agentic play</button>
        <button type="button" disabled={!active} onClick={onStop}>
          <Square size={16} aria-hidden="true" /> Stop Agentic play</button>
        <button type="button" onClick={onRecovery}><RefreshCw size={16} aria-hidden="true" /> Recovery</button>
      </div>
    </div>
  </Dialog>;
}
