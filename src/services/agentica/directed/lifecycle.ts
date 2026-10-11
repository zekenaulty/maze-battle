import type { AgenticaMessage, AgenticaStarted } from '../sdk/agentica-host.mjs';
import type { DirectedAgenticaBinding } from './contracts';
import { validateDirectedAgenticaBinding } from './commands';

export interface DirectedAgenticaStatus { state: string; detail?: unknown }

export function directedStartedBinding(draft: DirectedAgenticaBinding, started: AgenticaStarted) {
  for (const key of ['hostId', 'sessionId', 'sessionEpoch', 'scopeId', 'perspectiveId', 'objectiveId'] as const) {
    if (started[key] !== draft[key]) throw new Error('Directed Agentica start binding mismatch.');
  }
  const binding = { ...draft, runId: started.runId, manifestHash: started.manifestHash };
  validateDirectedAgenticaBinding(binding);
  return binding;
}

/** Execution termination and durable journey completion are separate contracts. */
export class DirectedRunLifecycle {
  private draft?: DirectedAgenticaBinding;
  private readonly previousRuns = new Set<string>();
  announced?: DirectedAgenticaBinding;
  terminalStatus?: string;
  parked = false;

  begin(draft: DirectedAgenticaBinding, recovering = false) {
    // A bound wake can be replayed after its local event acknowledgement failed.
    if (!recovering && draft.parentOperationId && this.announced?.runId === draft.runId
      && this.announced.parentOperationId === draft.parentOperationId) return;
    if (this.announced) this.previousRuns.add(this.announced.runId);
    this.draft = draft;
    this.announced = recovering ? draft : undefined;
    this.terminalStatus = undefined;
    this.parked = false;
  }

  failed(error: unknown) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    this.terminalStatus ??= code === 'operation.budget' ? 'blocked' : code ? 'failed' : 'unresolved';
  }

  message(message: AgenticaMessage): string | undefined {
    if (message.type === 'started' && this.draft && !this.announced && !this.previousRuns.has(message.runId!)) {
      try {
        const binding = directedStartedBinding(this.draft, message.payload);
        if (message.runId !== binding.runId || !message.requestId) return;
        this.announced = binding;
      } catch { /* A mismatched announcement cannot establish the active run. */ }
    }
    if (!this.announced || message.runId !== this.announced.runId || this.terminalStatus) return;
    const payload = message.payload;
    if (message.type === 'operation.parked') {
      if (payload.state === 'parked') { this.parked = true; return 'parked'; }
      if (['completed', 'blocked', 'cancelled'].includes(payload.state)) return this.terminalStatus = payload.state;
    }
    if (message.type === 'run.terminated') {
      return this.terminalStatus = payload.status === 'cancelled' ? 'cancelled' : this.parked ? 'unresolved' : 'failed';
    }
    if (message.type === 'cancelled' || message.type === 'cancel.requested') return this.terminalStatus = 'cancelled';
    if (message.type !== 'outcome' || this.parked) return;
    // Full and truncated envelopes both retain the nested outcome discriminator.
    switch (payload.outcome?.status) {
      case 'planInvalid': case 'failed': return this.terminalStatus = 'failed';
      case 'cancelled': return this.terminalStatus = 'cancelled';
      case 'succeeded': return this.terminalStatus = this.announced.parentOperationId ? 'completed' : 'blocked';
      case 'blocked': case 'partiallyComplete': case 'waitingForApproval': return this.terminalStatus = 'blocked';
      default: return this.terminalStatus = 'unresolved';
    }
  }
}
