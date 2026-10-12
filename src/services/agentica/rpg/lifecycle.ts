import type { AgenticaMessage, AgenticaStarted } from '../sdk/agentica-host.mjs';
import type { RpgAgenticaBinding } from './contracts';
import { requireRpg, validateRpgBinding } from './validation';

export function rpgStartedBinding(draft: RpgAgenticaBinding, started: AgenticaStarted) {
  for (const name of ['hostId', 'sessionId', 'sessionEpoch', 'scopeId', 'perspectiveId', 'objectiveId'] as const)
    requireRpg(started[name] === draft[name], 'service start binding mismatch');
  const binding = { ...structuredClone(draft), runId: started.runId, manifestHash: started.manifestHash };
  validateRpgBinding(binding); return binding;
}

/** A planner outcome is never a substitute for the game's completion event. */
export function rpgRunStatus(message: AgenticaMessage, runId?: string) {
  if (!runId || message.runId !== runId) return;
  if (message.type === 'operation.parked' && message.payload.state === 'parked') return 'parked';
  if (message.type === 'run.terminated' || message.type === 'outcome') return 'reconcile';
  if (message.type === 'cancelled' || message.type === 'cancel.requested') return 'cancelled';
}
